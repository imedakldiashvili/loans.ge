# loans.ge — API და მონაცემების სტანდარტები

> სტატუსი: შეთანხმებულია და დანერგილია API-ში (2026-10-15). ✅ = შენი მოთხოვნა, 💡 = ჩემი შევსება/წინადადება (დასადასტურებელი)

---

## 1. URL ფორმატი

✅ `/{gateway}/{module}/{action}`

| ნაწილი | მნიშვნელობა | მაგალითი |
|---|---|---|
| gateway ✅ | ვისთვისაა API — ცალკე ავტორიზაციით | `admin`, `partner`, `client`, `public` |
| module | ობიექტი / ფუნქციური ბლოკი | `organization`, `productType`, `application`, `offer`, `staff`, `city` |
| action | მოქმედება (სტანდარტული ან სპეციფიკური) | `add`, `edit`, `find`, `review` |

მაგალითები: `POST /admin/organization/add`, `POST /partner/application/find/1/20`, `PUT /partner/application/review/15/3f2a…`

**gateway-ები:**

| gateway | ვინ | ავტორიზაცია |
|---|---|---|
| `public` | ყველა, შესვლის გარეშე (ცნობარები, ორგანიზაციების სია, OTP-ის მოთხოვნა) | — |
| `client` | მსესხებელი (customer პროფილი) | სესია |
| `partner` | ორგანიზაცია — **კაბინეტიც და ბანკის სისტემაც (ინტეგრაცია) ერთი და იგივე API-ა** | კაბინეტი: სესია (staff პროფილი); ინტეგრაცია: ორგანიზაციის API გასაღები |
| `admin` | loans.ge-ს გუნდი (admin პროფილი) | სესია |
| `dev` | **მხოლოდ სატესტო გარემო:** OTP კოდების სანახავი (`apps/otp-viewer`) | — ; რთავს `DEV_OUTBOX=true`, `NODE_ENV=production`-ზე მარშრუტები საერთოდ არ არსებობს |

✅ `partner` = integration: ცალკე `integration` gateway არ არის. ბანკის სისტემა იმავე endpoint-ებს იძახებს, რასაც კაბინეტი; წესები (სტატუსები, PII დაფარვა, scope) ერთია. განსხვავება მხოლოდ ავტორიზაციაშია (`Authorization: ApiKey …`) და actionLog-ში `actorType = integration`.

## 2. სტანდარტული მოქმედებები (CRUD)

✅

| მეთოდი | URL | რას აკეთებს | Body |
|---|---|---|---|
| POST | `/{gw}/{module}/add` | დამატება | ობიექტი |
| PUT | `/{gw}/{module}/edit/{id}/{uid}` | რედაქტირება | ობიექტი |
| PUT | `/{gw}/{module}/disable/{id}/{uid}` | გამორთვა (`isEnable = false`) | — |
| PUT | `/{gw}/{module}/enable/{id}/{uid}` | ჩართვა (`isEnable = true`) | — |
| DELETE | `/{gw}/{module}/delete/{id}/{uid}` | წაშლა — **რბილი** (`isDeleted = true`) | — |
| GET | `/{gw}/{module}/detail/{id}/{uid}` | ერთი ჩანაწერი | — |
| POST | `/{gw}/{module}/find/{pageNumber}/{pageSize}` | ძებნა/სია paging-ით | ფილტრი + სორტირება |

💡 წესები:
- ყველა ოპერაცია ერთ ჩანაწერზე იღებს **ორივეს — `id` და `uid`**; თუ წყვილი არ ემთხვევა → `NOT_FOUND` (ვერ გამოიცნობენ სხვის ჩანაწერს id-ის გადარჩევით).
- `pageNumber` იწყება 1-დან; `pageSize` მაქსიმუმ 100.
- `find`-ის body:
  ```json
  { "Filter": { "Search": "ბანკი", "IsEnable": true }, "Sort": [{ "Field": "Sort", "Dir": "asc" }] }
  ```
- წაშლილი (`isDeleted`) ჩანაწერები `find`/`detail`-ში არ ჩანს.
- 💡 არასტანდარტული მოქმედებები (სტატუსის ცვლილება და ა.შ.) იმავე ფორმატით: `PUT /partner/application/review/{id}/{uid}`, `PUT /partner/application/reject/{id}/{uid}`, `PUT /client/offer/accept/{id}/{uid}`, `PUT /admin/city/move/{id}/{uid}` (რიგის ცვლილება ↑↓).

## 3. Response ფორმატი

✅ ყველა პასუხი სამი ველით — `IsSuccess`, `Data`, `Error` (JSON-ში **PascalCase**):

```json
{ "IsSuccess": true, "Data": { }, "Error": null }
```

✅ **`Data` მოქმედების მიხედვით:**

| მოქმედება | `Data` |
|---|---|
| `add`, `edit`, `enable`, `disable`, `delete` და სხვა ცვლილებები | `{ "ID": 15, "UID": "3f2a…" }` |
| `find` | `{ "Items": [ ], "PageNumber": 1, "PageSize": 20, "TotalCount": 137, "TotalPages": 7 }` |
| `detail` 💡 | სრული ობიექტი (`ID`, `UID` და ყველა ველი) |

შეცდომისას 💡:

```json
{
  "IsSuccess": false,
  "Data": null,
  "Error": {
    "Code": "VALIDATION_ERROR",
    "Message": "პირადი ნომერი უნდა იყოს 11 ციფრი",
    "Details": [{ "Field": "Pid", "Message": "11 ციფრი" }]
  }
}
```

💡 შეცდომის კოდები (ფიქსირებული სია): `VALIDATION_ERROR`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT` (მაგ. სტატუსის დაუშვებელი გადასვლა), `RATE_LIMITED`, `INTERNAL_ERROR`.
✅ **HTTP კოდი:** შეცდომაზე რეალური კოდი და `IsSuccess: false` — 400 `VALIDATION_ERROR`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `CONFLICT`, 429 `RATE_LIMITED`, 500 `INTERNAL_ERROR`; წარმატებაზე 200 და `IsSuccess: true`.
💡 `Message` ბრუნდება მომხმარებლის ენაზე (`Accept-Language: ka|en`).
💡 მოთხოვნის UID (actionLog-ის `Uid`) body-ში არ ბრუნდება — მოდის სათაურში `X-Request-Uid`; მხარდაჭერისთვის ამ კოდით ლოგში ზუსტად ვპოულობთ ზარს.

## 4. ყველა API ზარი — UID-ით და ლოგით (actionLog)

✅ ყოველ მოთხოვნას ენიჭება უნიკალური `uid` (თუ კლიენტი არ გამოგზავნის `X-Request-Uid`-ით — სერვერი ქმნის) და ბრუნდება სათაურში `X-Request-Uid`. ყოველი ზარი იწერება — წარმატებულიც და შეცდომითაც.

| ველი | ✅/💡 | აღწერა |
|---|---|---|
| `id` | 💡 | bigint |
| `uid` | ✅ | მოთხოვნის UID |
| `url` | ✅ | სრული გზა |
| `method` | ✅ | GET/POST/PUT/DELETE |
| `gateway` | 💡 | admin/partner/client/public |
| `module` | ✅ | |
| `action` | ✅ | |
| `itemId` | ✅ | ჩანაწერის id (თუ არის) |
| `itemUid` | ✅ | ჩანაწერის uid (თუ არის) |
| `createdBy` | ✅ | ვინ გამოიძახა (`user.ID`; ანონიმურზე null) |
| `userProfileId` | 💡 | რომელი პროფილით (customer/staff/admin) |
| `actorType` | 💡 | user/integration/system |
| `createdOn` | ✅ | დაწყების დრო |
| `completedOn` | ✅ | დასრულების დრო |
| `durationMs` | 💡 | ხანგრძლივობა |
| `responseCode` | ✅ | HTTP კოდი |
| `isSuccess` | 💡 | |
| `errorCode` / `errorMessage` | 💡 | შეცდომისას |
| `ip` / `userAgent` | 💡 | |

✅ **ინახება სამუდამოდ** — actionLog ინფორმაციის წყაროა (ვინ, რა, როდის, რა შედეგით), არ იშლება და არ რედაქტირდება.
💡 რომ დიდ მოცულობაზე არ შენელდეს: ცხრილი დაყოფილია თვეების მიხედვით (PostgreSQL partitioning), ინდექსები `created_on`, `created_by`, `module + item_id`, `uid`-ზე.
✅ მოთხოვნა და პასუხი ინახება **ცალკე ცხრილებში**, `actionLog`-ს უკავშირდება **მხოლოდ `uid`-ით** (ერთი ზარი = ერთი `actionLog` + ერთი `actionLogRequest` + ერთი `actionLogResponse`):

**`actionLogRequest`**

| ველი | აღწერა |
|---|---|
| `id` | bigint |
| `uid` | მოთხოვნის UID — კავშირი actionLog-თან (იგივე, რაც `actionLog.uid`) |
| `headers` | JSONB — საჭირო სათაურები (Accept-Language, User-Agent, Content-Type…); `Authorization` და cookie არ ინახება |
| `query` | JSONB — URL-ის პარამეტრები |
| `body` | JSONB — მოთხოვნის body |
| `createdOn` | |

**`actionLogResponse`**

| ველი | აღწერა |
|---|---|
| `id` | bigint |
| `uid` | მოთხოვნის UID — კავშირი actionLog-თან |
| `responseCode` | HTTP კოდი |
| `body` | JSONB — სტანდარტული პასუხი (`IsSuccess`, `Data`, `Error`) |
| `createdOn` | |

💡 **საიდუმლოებები იფარება** ჩაწერამდე (`***`): OTP კოდი, ტოკენები (access/refresh), API გასაღებები, webhook secret. დანარჩენი ინახება სრულად.
💡 ფაილები (ლოგოს ატვირთვა) body-ში არ ინახება — მხოლოდ სახელი, ტიპი, ზომა.
💡 სამივე ცხრილი სამუდამოდ ინახება და თვეების მიხედვით იყოფა (partitioning).
💡 ჩაწერა არ ანელებს პასუხს: ლოგი იწერება ასინქრონულად (რიგით).

## 5. Base Entity

✅ ჯერ **ერთი** — `BaseEntity`, ყველა ცხრილს (actionLog-ის გარდა):

| ველი | ტიპი |
|---|---|
| `ID` | bigint, auto |
| `UID` | uuid, უნიკალური |
| `IsEnable` | bool, default true |
| `CreatedBy` | bigint, null = სისტემა |
| `CreatedOn` | timestamptz |
| `UpdatedBy` | bigint, null |
| `UpdatedOn` | timestamptz, null |
| `IsDeleted` | bool, default false |
| `DeletedBy` | bigint, null |
| `DeletedOn` | timestamptz, null |

✅ `CreatedBy`/`UpdatedBy`/`DeletedBy` = **`user.ID`** — ყველა მომხმარებელი ერთ ცხრილშია (`user`), თითოეულს მინიმუმ ერთი პროფილი დასაშვები ტიპებიდან (customer / staff / admin). დეტალები: BACKEND-PLAN.md → „მომხმარებლები და პროფილები".

## 6. დასახელება

- ✅ API / JSON: **PascalCase** — `IsSuccess`, `Data`, `Error`, `ID`, `UID`, `CreatedOn`, `IsEnable`… (აბრევიატურები `ID`, `UID` — დიდი ასოებით).
- 💡 ბაზა: ცხრილები და ველები `snake_case` (`created_on`); გადაყვანას API ფენა აკეთებს.
- 💡 URL-ში module და action — `camelCase` (`/admin/productType/find/1/20`).
- ✅ (დანერგვისას) მონაცემი, რომლის გასაღებიც თავად მონაცემია (მაგ. სტატუსი → რაოდენობა), ბრუნდება **სიად** — `[{ "Status": "sent", "Count": 33 }]`, რომ გასაღები PascalCase-ად არ გადაკეთდეს.
- ✅ ბიზნეს-გასაღები (კოდი, key) უნიკალურია მხოლოდ არაწაშლილ ჩანაწერებს შორის — წაშლილის კოდით ახლის დამატება შეიძლება.

## 7. გადაწყვეტილი / ღია

| # | საკითხი | სტატუსი |
|---|---|---|
| 1 | JSON-ის ველები | ✅ PascalCase |
| 2 | Response | ✅ `IsSuccess`, `Data`, `Error`; ცვლილებებზე `Data` = `{ID, UID}` |
| 3 | HTTP კოდები | ✅ რეალური კოდი + `IsSuccess: false` |
| 4 | Base Entity | ✅ ჯერ ერთი `BaseEntity` (`IsEnable`-ით) |
| 5 | actionLog | ✅ სამუდამოდ; მოთხოვნა/პასუხი ცალკე — `actionLogRequest`, `actionLogResponse` (საიდუმლოებები დაფარული) |
| 6 | `gateway` | ✅ `public` / `client` / `partner` (= integration) / `admin` |
| 7 | მომხმარებლები | ✅ ერთი `user` ცხრილი + მინიმუმ ერთი პროფილი (`user_profile`); `CreatedBy` = `user.ID` |
| 8 | სტატუსები და გადასვლები | ✅ ბაზაში (`status`, `status_transition`), ადმინიდან სამართავი |
