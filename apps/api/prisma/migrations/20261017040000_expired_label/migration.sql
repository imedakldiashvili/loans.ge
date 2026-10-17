-- Customer text of "expired": shorter.
UPDATE "status" SET "customer_ka" = 'შეთავაზების ვადა გავიდა', "updated_on" = now() WHERE "key" = 'expired' AND "is_deleted" = false;
