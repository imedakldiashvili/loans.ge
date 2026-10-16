import { Controller, Injectable, Param, ParseIntPipe, Post, Put, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileStore } from '../core/files';
import { notFound } from '../core/errors';
import { PrismaService } from '../core/prisma.service';
import { currentUserId } from '../core/request-context';

// Organisation logo (admin): POST uploadLogo/{id}/{uid} (multipart, field "File") — PNG / JPG / WebP / SVG up to 512 KB;
// PUT removeLogo/{id}/{uid}. The file is stored under /fs/org/…; organization.logoPath keeps its key ("org/…").

const MAX_BYTES = 512 * 1024;
/** What multer gives (kept in memory — no `dest`). */
type Upload = { buffer: Buffer; size: number; originalname: string; mimetype: string };

@Injectable()
export class OrgLogoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly files: FileStore,
  ) {}

  private async load(id: number, uid: string) {
    const org = await this.prisma.organization.findFirst({ where: { id: BigInt(id), uid, isDeleted: false } });
    if (!org) throw notFound('ორგანიზაცია');
    return org;
  }

  async upload(id: number, uid: string, file: Upload | undefined) {
    const org = await this.load(id, uid);
    const key = await this.files.saveImage('org', org.uid, file, MAX_BYTES);
    await this.prisma.organization.update({ where: { id: org.id }, data: { logoPath: key, updatedBy: currentUserId(), updatedOn: new Date() } });
    // the previous logo is not needed any more
    if (org.logoPath && org.logoPath !== key) await this.files.remove(org.logoPath);
    return { id: org.id, uid: org.uid, logoPath: key };
  }

  async remove(id: number, uid: string) {
    const org = await this.load(id, uid);
    await this.prisma.organization.update({ where: { id: org.id }, data: { logoPath: null, updatedBy: currentUserId(), updatedOn: new Date() } });
    await this.files.remove(org.logoPath);
    return { id: org.id, uid: org.uid, logoPath: null };
  }
}

@Controller('admin/organization')
export class OrgLogoController {
  constructor(private readonly svc: OrgLogoService) {}

  @Post('uploadLogo/:id/:uid')
  // multer stops only far beyond the limit — a merely too large file gets our own message
  @UseInterceptors(FileInterceptor('File', { limits: { fileSize: 4 * MAX_BYTES, files: 1 } }))
  upload(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string, @UploadedFile() file: Upload | undefined) {
    return this.svc.upload(id, uid, file);
  }

  @Put('removeLogo/:id/:uid')
  remove(@Param('id', ParseIntPipe) id: number, @Param('uid') uid: string) {
    return this.svc.remove(id, uid);
  }
}
