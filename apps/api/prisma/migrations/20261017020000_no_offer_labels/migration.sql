-- Closed before an offer: the customer text says so.
UPDATE "status" SET "customer_ka" = 'შეთავაზების გარეშე - უარყოფილია ორგანიზაციის მიერ', "customer_en" = 'No offer — rejected by the organisation', "updated_on" = now() WHERE "key" = 'rejected' AND "is_deleted" = false;
UPDATE "status" SET "customer_ka" = 'შეთავაზების გარეშე - უარყოფილი მომხმარებლის მიერ', "customer_en" = 'No offer — declined by the customer', "updated_on" = now() WHERE "key" = 'withdrawn' AND "is_deleted" = false;
