-- Repair jobs schema (Neon Postgres).
-- Status values mirror src/lib/api.ts:
--   'รอแก้ไข'    = STATUS_PENDING
--   'ปิดงานแล้ว'  = STATUS_CLOSED
-- The UI maps these to "รอซ่อม" / "ซ่อมเสร็จแล้ว" for display.
--
-- Photos are stored the way the app produces them today: base64 data URLs
-- (`data:image/jpeg;base64,...`), not Drive/object-storage URLs. Swap these for
-- a file URL once photos are uploaded to storage.

create sequence if not exists repair_job_id_seq start 1;

create table if not exists repair_jobs (
  row_index             bigint generated always as identity primary key,
  id                    text not null unique
                        default ('GW-' || lpad(nextval('repair_job_id_seq')::text, 3, '0')),
  created_date          date not null default current_date,
  due_date              date not null default (current_date + 30),
  group_id              text not null,
  zone                  text not null,
  category              text not null default '',
  risk_level            text not null default '',
  location_detail       text not null default '',
  suggestion            text not null default '',
  before_photo_data_url text not null default '',
  status                text not null default 'รอแก้ไข'
                        check (status in ('รอแก้ไข', 'ปิดงานแล้ว')),
  closed_date           date,
  after_photo_data_url  text not null default '',
  staff_note            text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists repair_jobs_status_idx on repair_jobs (status);
create index if not exists repair_jobs_zone_idx on repair_jobs (zone);

-- Row shape expected by the frontend (camelCase + dd/mm/yyyy dates).
create or replace view repair_jobs_api as
select
  row_index                                        as "rowIndex",
  id,
  to_char(created_date, 'DD/MM/YYYY')              as "createdDate",
  to_char(due_date, 'DD/MM/YYYY')                  as "dueDate",
  group_id                                         as "groupId",
  zone,
  category,
  risk_level                                       as "riskLevel",
  location_detail                                  as "locationDetail",
  suggestion,
  before_photo_data_url                            as "beforePhoto",
  status,
  coalesce(to_char(closed_date, 'DD/MM/YYYY'), '')  as "closedDate",
  after_photo_data_url                             as "afterPhoto",
  staff_note                                       as "staffNote"
from repair_jobs;
