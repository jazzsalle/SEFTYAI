-- 재난안전 AI 시범서비스 — Supabase(Postgres + PostGIS) 스키마
-- 현재 시연판은 data/seed/*.json 을 서버에서 직접 읽는다. 운영 전환 시 이 스키마로 적재하고
-- src/lib/server/*.ts 의 조회 함수 구현만 Supabase 쿼리로 교체한다 (함수 시그니처 유지).
create extension if not exists postgis;

-- 재난마스터 사건 : {재난유형코드}-{발생일 YYYYMMDD}-{같은날·같은유형 순번}
create table if not exists events (
  event_id        text primary key,               -- 1001-20200723-01
  alias_id        text,                           -- RAIN-20200723-01
  type_code       text not null,                  -- 02.재난코드 정보 (1001 호우, 1005 태풍 …)
  type_name       text not null,
  start_date      date not null,
  end_date        date,
  status          text not null,                  -- 진행중 | 종료
  title           text not null,
  summary         text,
  ndms_key        jsonb,                          -- {DSTR_YEAR, DSTR_TY_CD, DSTR_SN, DSTR_NM}
  weather         jsonb,                          -- advisories, hourly, max/total rain, rainfallSource
  similar_cases   jsonb,
  synthetic       boolean default false,
  training        boolean default false,
  data_quality    jsonb
);

-- 사건 × 지역 기록 : {eventId}-{시군구코드}
create table if not exists event_regions (
  region_record_id text primary key,
  event_id         text references events(event_id) on delete cascade,
  sido             text, sigungu text, adm_code text,
  crisis_level     text,
  summary          text,
  damage_tags      text[],
  damages          jsonb,                         -- publicFacilityLedger, publicFloodItems, privateFacility, insurance, human
  recovery         jsonb,
  flood_traces     jsonb,
  actions          jsonb,
  facts            jsonb,
  weather_local    jsonb
);
create index if not exists event_regions_event_idx on event_regions(event_id);

-- 소방긴급구조정보(표준) 21항목 + 확장
create table if not exists reports_119 (
  report_id        text primary key,
  event_id         text references events(event_id),
  region_record_id text references event_regions(region_record_id),
  reported_at      timestamptz not null,           -- 신고일시
  std              jsonb not null,                 -- 표준 21개 항목 원형
  accident_type    text,
  location_detail  text,
  geom             geometry(Point, 4326),
  rescuee_count    int default 0,
  result           text,
  call_summary     text,
  synthetic        boolean default false
);
create index if not exists reports_119_geom_idx on reports_119 using gist(geom);

create table if not exists situation_reports (
  report_id        text primary key,
  event_id         text references events(event_id),
  region_record_id text,
  report_kind      text, report_no text, title text,
  submitted_at     timestamptz,
  body             jsonb,                          -- overview, damage, actions, outlook, message
  synthetic        boolean default false,
  source_file      text
);

-- 위험·취약 객체 (어디·왜·언제·정비·이력)
create table if not exists risk_objects (
  id            text primary key,                  -- CL-00011, UP-00001 …
  category      text not null,                     -- 급경사지, 지하차도, 야영장 …
  name          text not null,
  sido text, sigungu text, emd text, adm_code text,
  geom          geometry(Point, 4326) not null,
  coord_approx  boolean default false,
  grade         text,
  risk_level    text,
  reason        text,                              -- 왜 위험한가
  trigger       jsonb,                             -- 언제 위험해지나 {text, thresholds, derived, basis}
  plan          jsonb,                             -- 정비계획
  history       jsonb,                             -- 과거 피해 (→ events)
  attrs         jsonb,
  source        jsonb,
  sample        boolean default false
);
create index if not exists risk_objects_geom_idx on risk_objects using gist(geom);
create index if not exists risk_objects_cat_idx on risk_objects(category, sigungu);

-- 행동매뉴얼
create table if not exists manuals (id text primary key, region text, title text, version text, responsible_dept text, page_count int, page_note text, images jsonb, field_actions jsonb, reporting jsonb);
create table if not exists manual_stages (stage_id text primary key, manual_id text references manuals(id), seq int, name text, trigger text, emergency_level text);
create table if not exists manual_tasks (id bigserial primary key, stage_id text references manual_stages(stage_id), seq int, code text, task text, owner text, timing text, checkpoints text[], related_objects text[], page int);

-- 재해대장 (2010~2025)
create table if not exists ledger (
  id text primary key, date_start date, disaster_name text, disaster_type text,
  sido text, sigungu text, emd text, geom geometry(Point, 4326), coord_approx boolean,
  facility jsonb, damage_summary text, damage_krw_thousand bigint, recovery_krw_thousand bigint, source jsonb
);

-- 사용자 상태 (시연판은 localStorage)
create table if not exists conversations (id text primary key, account_id text not null, title text, region text, disaster_type text, ref_entity jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists turns (id text primary key, conversation_id text references conversations(id) on delete cascade, question text, preset_key text, response jsonb, asked_at timestamptz default now());
create table if not exists checklist_state (account_id text, item_key text, done boolean default false, updated_at timestamptz default now(), primary key (account_id, item_key));
create table if not exists briefing_presets (account_id text, seq int, key text, label text, question text, enabled boolean default true, primary key (account_id, seq));

-- 조회 예 : 진행 중 사건 119 신고 반경 1km 내 급경사지
-- select r.* from risk_objects r join reports_119 f on st_dwithin(r.geom::geography, f.geom::geography, 1000)
--  where r.category in ('급경사지','붕괴위험지역') and f.event_id = '1001-20261002-01';
