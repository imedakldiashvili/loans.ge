import { Body, Controller, Injectable, Param, ParseIntPipe, Post } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { parse } from '../core/crud';
import { validation } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { currentContext } from '../core/request-context';

// Partner gateway — the offers the organisation's staff sent (back office only: the role guard lets sales into
// `application` only). One row per offer: the card's terms, the customer, the record's status, who sent it and when.
// An offer exists only after the review started, so the applicant is never masked here; the contacts are open too.

const PAGE_MAX = 100;

const findBody = z.preprocess(
  (v) => v ?? {},
  z.object({
    filter: z.preprocess(
      (v) => v ?? {},
      z.object({
        search: z.string().trim().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        productTypeId: z.coerce.bigint().optional(),
        /** true — the ones the customer chose; false — not chosen (yet) */
        chosen: z.boolean().optional(),
      }),
    ),
  }),
);

@Injectable()
export class PartnerOfferService {
  constructor(private readonly prisma: PrismaService) {}

  async find(pageNumber: number, pageSize: number, body: unknown) {
    if (pageNumber < 1 || pageSize < 1 || pageSize > PAGE_MAX) throw validation([{ field: 'PageSize', message: `1-დან ${PAGE_MAX}-მდე` }]);
    const { filter: f } = parse(findBody, body);
    const org = currentContext()?.organizationId ?? BigInt(-1);
    const where: Prisma.OfferWhereInput = {
      isDeleted: false,
      ...(f.from || f.to ? { createdOn: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
      ...(f.chosen === undefined ? {} : { chosenOn: f.chosen ? { not: null } : null }),
      applicationOrg: {
        organizationId: org, isDeleted: false,
        application: {
          isDeleted: false,
          ...(f.productTypeId ? { productTypeId: f.productTypeId } : {}),
          ...(f.search ? { OR: ['firstName', 'lastName', 'pid', 'phone'].map((k) => ({ [k]: { contains: f.search, mode: 'insensitive' as const } })) } : {}),
        },
      },
    };
    const [rows, totalCount] = await Promise.all([
      this.prisma.offer.findMany({
        where, orderBy: { createdOn: 'desc' }, skip: (pageNumber - 1) * pageSize, take: pageSize,
        include: {
          card: { select: { id: true, offerTypeId: true } },
          applicationOrg: {
            select: {
              id: true, uid: true, status: true, statusOn: true, assignedTo: { select: { id: true, displayName: true } },
              application: {
                select: {
                  id: true, firstName: true, lastName: true, pid: true, phone: true, email: true, amount: true, currency: true, cityId: true, districtId: true,
                  productType: { select: { id: true, nameKa: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.offer.count({ where }),
    ]);
    // who sent it: the staff member of this organisation behind the user id
    const userIds = [...new Set(rows.map((r) => r.createdBy).filter((x): x is bigint => x !== null))];
    const staff = userIds.length
      ? await this.prisma.userProfile.findMany({ where: { userId: { in: userIds }, organizationId: org }, select: { userId: true, displayName: true } })
      : [];
    const by = new Map(staff.map((s) => [s.userId, s.displayName]));
    return {
      items: rows.map((r) => ({ ...r, sentBy: r.createdBy !== null ? (by.get(r.createdBy) ?? null) : null })),
      pageNumber, pageSize, totalCount, totalPages: Math.ceil(totalCount / pageSize),
    };
  }
}

@Controller('partner/offer')
export class PartnerOfferController {
  constructor(private readonly svc: PartnerOfferService) {}

  @Post('find/:pageNumber/:pageSize')
  find(@Param('pageNumber', ParseIntPipe) p: number, @Param('pageSize', ParseIntPipe) s: number, @Body() body: unknown) {
    return this.svc.find(p, s, body);
  }
}
