import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type HeaderValue = string | string[] | undefined;

type VercelRequest = {
  method?: string;
  headers: Record<string, HeaderValue>;
};

type VercelResponse = {
  setHeader(name: string, value: string): void;
  status(code: number): VercelResponse;
  json(body: unknown): void;
};

type DemoUser = {
  userId: string;
  name: string;
  email: string;
  roles: string[];
};

type ResetTable = {
  table: string;
  column: string;
  sentinel: string | number;
};

type RoleSeed = {
  slug: string;
  name: string;
};

class DemoResetHttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";
const DEMO_RESET_HEADER = "portal-demo-reset";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROLE_SEEDS: RoleSeed[] = [
  { slug: "admin", name: "Admin" },
  { slug: "alum", name: "Alumni" },
  { slug: "brother", name: "Brother" },
  { slug: "neophyte", name: "Neophyte" },
  { slug: "ea", name: "Eminent Archon" },
  { slug: "eda", name: "Eminent Deputy Archon" },
  { slug: "rec", name: "Recorder" },
  { slug: "treasurer", name: "Treasurer" },
  { slug: "stew", name: "Steward" },
  { slug: "social-chair", name: "Social Chairman" },
  { slug: "social-events", name: "Social Events Chairman" },
  { slug: "hsm", name: "Health & Safety Manager" },
  { slug: "hm", name: "House Manager" },
  { slug: "membered", name: "Member Educator" },
  { slug: "cs-chair", name: "Community Service Chairman" },
  { slug: "philo-chair", name: "Philanthropy Chairman" },
  { slug: "alumni-chair", name: "Alumni Chairman" },
  { slug: "rush-chair", name: "Rush Chairman" },
  { slug: "scholarship", name: "Scholarship Chairman" },
  { slug: "prof-dev", name: "Professional Development Chairman" },
  { slug: "chapter-dev", name: "Chapter Development" },
  { slug: "dei-chair", name: "DEI Chairman" },
  { slug: "preceptor", name: "Preceptor" },
];

const PUBLIC_TABLE_RESET_ORDER: ResetTable[] = [
  { table: "announcement_likes", column: "announcement_id", sentinel: ZERO_UUID },
  { table: "budget_transactions", column: "id", sentinel: ZERO_UUID },
  { table: "wait_on_assignments", column: "id", sentinel: ZERO_UUID },
  { table: "emergency_contacts", column: "id", sentinel: ZERO_UUID },
  { table: "announcements", column: "id", sentinel: ZERO_UUID },
  { table: "events", column: "id", sentinel: ZERO_UUID },
  { table: "transactions", column: "id", sentinel: ZERO_UUID },
  { table: "budget_accounts", column: "id", sentinel: ZERO_UUID },
  { table: "wait_on_schedules", column: "id", sentinel: ZERO_UUID },
  { table: "budget_cycles", column: "id", sentinel: ZERO_UUID },
  { table: "user_roles", column: "user_id", sentinel: ZERO_UUID },
  { table: "profiles", column: "user_id", sentinel: ZERO_UUID },
  { table: "audit_log", column: "id", sentinel: -1 },
  { table: "calendars", column: "id", sentinel: -1 },
  { table: "majors", column: "id", sentinel: -1 },
  { table: "roles", column: "slug", sentinel: "__portal_demo_reset_sentinel__" },
];

const MAJOR_SEEDS = [
  { major: "Computer Science", slug: "computer-science" },
  { major: "Finance", slug: "finance" },
  { major: "Mechanical Engineering", slug: "mechanical-engineering" },
  { major: "Biology", slug: "biology" },
  { major: "Political Science", slug: "political-science" },
];

const ID = {
  budgetCycle: "10000000-0000-4000-8000-000000000001",
  budgetSocial: "10000000-0000-4000-8000-000000000002",
  budgetPhilo: "10000000-0000-4000-8000-000000000003",
  budgetStew: "10000000-0000-4000-8000-000000000004",
  budgetTxSubmitted: "10000000-0000-4000-8000-000000000005",
  budgetTxApproved: "10000000-0000-4000-8000-000000000006",
  budgetTxReimbursed: "10000000-0000-4000-8000-000000000007",
  waitOnSchedule: "10000000-0000-4000-8000-000000000008",
  waitOnMondayLunch: "10000000-0000-4000-8000-000000000009",
  waitOnMondayDinner: "10000000-0000-4000-8000-000000000010",
  waitOnTuesdayDinner: "10000000-0000-4000-8000-000000000011",
  announcementChapter: "10000000-0000-4000-8000-000000000012",
  announcementService: "10000000-0000-4000-8000-000000000013",
  announcementBudget: "10000000-0000-4000-8000-000000000014",
  eventChapter: "10000000-0000-4000-8000-000000000015",
  eventService: "10000000-0000-4000-8000-000000000016",
  eventFormal: "10000000-0000-4000-8000-000000000017",
  eventAlumni: "10000000-0000-4000-8000-000000000018",
  emergencyPrimary: "10000000-0000-4000-8000-000000000019",
  emergencySecondary: "10000000-0000-4000-8000-000000000020",
  legacyTransaction: "10000000-0000-4000-8000-000000000021",
  legacyBudget: "10000000-0000-4000-8000-000000000022",
} as const;

function normalizeAppEnvironment(value: string | undefined): "production" | "demo" {
  return value?.trim().toLowerCase() === "demo" ? "demo" : "production";
}

function getHeader(req: VercelRequest, name: string): string | undefined {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function isSameOriginRequest(req: VercelRequest): boolean {
  const origin = getHeader(req, "origin");
  const host = getHeader(req, "host");

  if (!origin || !host) {
    return true;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function getRequiredEnv(name: string): string {
  const value = getOptionalEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }

  return value;
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function getRequiredFirstEnv(names: string[], label: string): string {
  const value = names.map((name) => getOptionalEnv(name)).find(Boolean);

  if (!value) {
    throw new Error(`Missing required environment variable ${label}`);
  }

  return value;
}

function getSupabaseUrl(): string {
  return getRequiredFirstEnv(["SUPABASE_URL", "VITE_SUPABASE_URL"], "SUPABASE_URL or VITE_SUPABASE_URL");
}

function readSecretKeysDictionary(): string | undefined {
  const rawValue = getOptionalEnv("SUPABASE_SECRET_KEYS");

  if (!rawValue) {
    return undefined;
  }

  const parsed: unknown = JSON.parse(rawValue);

  if (!isRecord(parsed)) {
    throw new Error("SUPABASE_SECRET_KEYS must be a JSON object");
  }

  const defaultKey = parsed.default;
  if (typeof defaultKey === "string" && defaultKey.trim()) {
    return defaultKey.trim();
  }

  const firstStringValue = Object.values(parsed).find((value) => typeof value === "string" && value.trim());
  return typeof firstStringValue === "string" ? firstStringValue.trim() : undefined;
}

function getSupabaseSecretKey(): string {
  const directKey = getOptionalEnv("SUPABASE_SERVICE_ROLE_KEY") ?? getOptionalEnv("SUPABASE_SECRET_KEY");

  if (directKey) {
    return directKey;
  }

  const dictionaryKey = readSecretKeysDictionary();

  if (dictionaryKey) {
    return dictionaryKey;
  }

  throw new Error("Missing required environment variable SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseStringField(value: unknown, field: string, index: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`DEMO_AUTH_USERS_JSON user ${index + 1} needs a non-empty ${field}`);
  }

  return value.trim();
}

function normalizeRoleSlug(value: unknown, index: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`DEMO_AUTH_USERS_JSON user ${index + 1} has an invalid role`);
  }

  return value.trim().toLowerCase();
}

function parseRoles(value: unknown, index: number): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`DEMO_AUTH_USERS_JSON user ${index + 1} needs at least one role`);
  }

  return [...new Set(value.map((role) => normalizeRoleSlug(role, index)))];
}

function parseDemoUsers(): DemoUser[] {
  const rawValue = getRequiredEnv("DEMO_AUTH_USERS_JSON");
  const parsed: unknown = JSON.parse(rawValue);

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("DEMO_AUTH_USERS_JSON must be a non-empty JSON array");
  }

  const users = parsed.map((user, index) => {
    if (!isRecord(user)) {
      throw new Error(`DEMO_AUTH_USERS_JSON user ${index + 1} must be an object`);
    }

    return {
      userId: parseStringField(user.userId, "userId", index),
      name: parseStringField(user.name, "name", index),
      email: parseStringField(user.email, "email", index),
      roles: parseRoles(user.roles, index),
    };
  });

  const userIds = new Set(users.map((user) => user.userId));
  const emails = new Set(users.map((user) => user.email.toLowerCase()));

  if (userIds.size !== users.length) {
    throw new Error("DEMO_AUTH_USERS_JSON contains duplicate userId values");
  }

  if (emails.size !== users.length) {
    throw new Error("DEMO_AUTH_USERS_JSON contains duplicate email values");
  }

  if (users.some((user) => user.userId === ZERO_UUID || !UUID_PATTERN.test(user.userId))) {
    throw new Error("DEMO_AUTH_USERS_JSON userId values must be real Supabase Auth UUIDs");
  }

  if (!users.some((user) => user.roles.includes("admin"))) {
    throw new Error("DEMO_AUTH_USERS_JSON needs at least one user with the admin role");
  }

  return users;
}

function humanizeSlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildRoleSeeds(users: DemoUser[]): RoleSeed[] {
  const roles = new Map(ROLE_SEEDS.map((role) => [role.slug, role.name]));

  for (const user of users) {
    for (const roleSlug of user.roles) {
      if (!roles.has(roleSlug)) {
        roles.set(roleSlug, humanizeSlug(roleSlug));
      }
    }
  }

  return Array.from(roles, ([slug, name]) => ({ slug, name }));
}

function addDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function addHours(date: Date, hours: number): Date {
  const nextDate = new Date(date);
  nextDate.setHours(nextDate.getHours() + hours);
  return nextDate;
}

function startOfDay(date: Date): Date {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoTimestamp(date: Date): string {
  return date.toISOString();
}

function nextMonday(date: Date): Date {
  const normalizedDate = startOfDay(date);
  const day = normalizedDate.getDay();
  const daysUntilMonday = day === 1 ? 0 : (8 - day) % 7;
  return addDays(normalizedDate, daysUntilMonday);
}

function userAt(users: DemoUser[], index: number): DemoUser {
  return users[index] ?? users[0];
}

function userWithRole(users: DemoUser[], role: string): DemoUser {
  return users.find((user) => user.roles.includes(role)) ?? users[0];
}

async function resetTable(client: SupabaseClient, reset: ResetTable): Promise<void> {
  const { error } = await client.from(reset.table).delete().neq(reset.column, reset.sentinel);

  if (error) {
    throw new Error(`Could not reset ${reset.table}: ${error.message}`);
  }
}

async function insertRows(client: SupabaseClient, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const { error } = await client.from(table).insert(rows);

  if (error) {
    throw new Error(`Could not seed ${table}: ${error.message}`);
  }
}

async function upsertRows(
  client: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const { error } = await client.from(table).upsert(rows, { onConflict });

  if (error) {
    throw new Error(`Could not seed ${table}: ${error.message}`);
  }
}

async function updateRow(
  client: SupabaseClient,
  table: string,
  column: string,
  value: string | number,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await client.from(table).update(values).eq(column, value);

  if (error) {
    throw new Error(`Could not update ${table}: ${error.message}`);
  }
}

async function resetPublicTables(client: SupabaseClient): Promise<void> {
  for (const reset of PUBLIC_TABLE_RESET_ORDER) {
    await resetTable(client, reset);
  }
}

async function seedDemoData(client: SupabaseClient, users: DemoUser[]): Promise<void> {
  const now = new Date();
  const adminUser = userWithRole(users, "admin");
  const secondUser = userAt(users, 1);
  const thirdUser = userAt(users, 2);
  const treasurerUser = userWithRole(users, "treasurer");
  const stewardUser = userWithRole(users, "stew");
  const serviceUser = userWithRole(users, "cs-chair");
  const alumniUser = userWithRole(users, "alumni-chair");
  const termStart = startOfDay(addDays(now, -21));
  const termEnd = startOfDay(addDays(now, 120));
  const waitOnWeekStart = nextMonday(now);
  const chapterEventStart = addHours(addDays(now, 3), 19);
  const serviceEventStart = addHours(addDays(now, 8), 10);
  const formalEventStart = addHours(addDays(now, 18), 20);
  const alumniEventStart = addHours(addDays(now, 30), 13);

  await upsertRows(client, "roles", buildRoleSeeds(users), "slug");
  await insertRows(client, "majors", MAJOR_SEEDS);

  await insertRows(
    client,
    "profiles",
    users.map((user, index) => ({
      user_id: user.userId,
      name: user.name,
      status: "active",
      email: user.email,
      phone: `555-010${index}`,
      grad_year: 2027 + (index % 3),
      hometown: ["Raleigh, NC", "Atlanta, GA", "Chicago, IL", "Denver, CO"][index % 4],
    })),
  );

  await insertRows(
    client,
    "user_roles",
    users.flatMap((user) =>
      user.roles.map((roleSlug) => ({
        user_id: user.userId,
        role_slug: roleSlug,
      })),
    ),
  );

  await insertRows(client, "calendars", [
    {
      start: dateOnly(termStart),
      end: dateOnly(termEnd),
      name: `Demo Term ${termStart.getFullYear()}`,
    },
  ]);

  await insertRows(client, "announcements", [
    {
      id: ID.announcementChapter,
      title: "Chapter meeting moved to Wednesday",
      body: "The demo chapter meeting has been moved to Wednesday evening in the chapter room.",
      visibility: "active",
      author_id: adminUser.userId,
      likes: 0,
      created_at: isoTimestamp(addDays(now, -2)),
    },
    {
      id: ID.announcementService,
      title: "Service hours update",
      body: "Community service signups are open for the food bank shift this weekend.",
      visibility: "active",
      author_id: serviceUser.userId,
      likes: 0,
      created_at: isoTimestamp(addDays(now, -1)),
    },
    {
      id: ID.announcementBudget,
      title: "Expense requests due Friday",
      body: "Submit demo receipts before Friday so the treasurer queue stays current.",
      visibility: "active",
      author_id: treasurerUser.userId,
      likes: 0,
      created_at: isoTimestamp(now),
    },
  ]);

  await insertRows(client, "announcement_likes", [
    {
      announcement_id: ID.announcementChapter,
      user_id: secondUser.userId,
      created_at: isoTimestamp(addHours(now, -12)),
    },
    {
      announcement_id: ID.announcementService,
      user_id: thirdUser.userId,
      created_at: isoTimestamp(addHours(now, -6)),
    },
  ]);

  await updateRow(client, "announcements", "id", ID.announcementChapter, { likes: 1 });
  await updateRow(client, "announcements", "id", ID.announcementService, { likes: 1 });
  await updateRow(client, "announcements", "id", ID.announcementBudget, { likes: 0 });

  await insertRows(client, "events", [
    {
      id: ID.eventChapter,
      title: "Demo Chapter Meeting",
      description: "Weekly business meeting with reports from each chair.",
      event_type: "house_meeting",
      details: { agenda: ["Officer reports", "Budget review", "Upcoming events"] },
      start: isoTimestamp(chapterEventStart),
      end: isoTimestamp(addHours(chapterEventStart, 1)),
      created_by: adminUser.userId,
      visible_to_alum: false,
      visible_to_neophyte: true,
      created_at: isoTimestamp(addDays(now, -5)),
    },
    {
      id: ID.eventService,
      title: "Food Bank Volunteer Shift",
      description: "Sort donations and log service hours for the chapter.",
      event_type: "community_service",
      details: {
        organization: "City Food Bank",
        location: "123 Market Street",
        hoursGoal: 24,
      },
      start: isoTimestamp(serviceEventStart),
      end: isoTimestamp(addHours(serviceEventStart, 3)),
      created_by: serviceUser.userId,
      visible_to_alum: false,
      visible_to_neophyte: true,
      created_at: isoTimestamp(addDays(now, -4)),
    },
    {
      id: ID.eventFormal,
      title: "Demo Formal",
      description: "Formal event planning sample with attendee and budget details.",
      event_type: "formal",
      details: {
        venue: "Union Hall",
        estimatedAttendees: 84,
        ticketPrice: 45,
      },
      start: isoTimestamp(formalEventStart),
      end: isoTimestamp(addHours(formalEventStart, 4)),
      created_by: userWithRole(users, "social-chair").userId,
      visible_to_alum: false,
      visible_to_neophyte: false,
      created_at: isoTimestamp(addDays(now, -3)),
    },
    {
      id: ID.eventAlumni,
      title: "Alumni Lunch",
      description: "Open alumni lunch with chapter updates and networking.",
      event_type: "alumni_event",
      details: {
        location: "Downtown Grill",
        publicNote: "Guests can meet near the private dining room.",
      },
      start: isoTimestamp(alumniEventStart),
      end: isoTimestamp(addHours(alumniEventStart, 2)),
      created_by: alumniUser.userId,
      visible_to_alum: true,
      visible_to_neophyte: false,
      created_at: isoTimestamp(addDays(now, -2)),
    },
  ]);

  await insertRows(client, "budget_cycles", [
    {
      id: ID.budgetCycle,
      name: `Demo Budget ${now.getFullYear()}`,
      start_date: dateOnly(termStart),
      end_date: dateOnly(termEnd),
      is_active: true,
      created_by: treasurerUser.userId,
      created_at: isoTimestamp(addDays(now, -14)),
    },
  ]);

  await insertRows(client, "budget_accounts", [
    {
      id: ID.budgetSocial,
      cycle_id: ID.budgetCycle,
      role_slug: "social-chair",
      allocated_amount: 3500,
      notes: "Formal and chapter social programming.",
      created_by: treasurerUser.userId,
      created_at: isoTimestamp(addDays(now, -13)),
    },
    {
      id: ID.budgetPhilo,
      cycle_id: ID.budgetCycle,
      role_slug: "philo-chair",
      allocated_amount: 1200,
      notes: "Philanthropy event materials and donations.",
      created_by: treasurerUser.userId,
      created_at: isoTimestamp(addDays(now, -13)),
    },
    {
      id: ID.budgetStew,
      cycle_id: ID.budgetCycle,
      role_slug: "stew",
      allocated_amount: 900,
      notes: "Meal supplies and wait-on operations.",
      created_by: treasurerUser.userId,
      created_at: isoTimestamp(addDays(now, -13)),
    },
  ]);

  await insertRows(client, "budget_transactions", [
    {
      id: ID.budgetTxSubmitted,
      budget_account_id: ID.budgetSocial,
      submitted_by: secondUser.userId,
      amount: 248.19,
      vendor: "Campus Florist",
      category: "Decor",
      description: "Centerpieces for the demo formal.",
      transaction_date: dateOnly(addDays(now, -2)),
      status: "submitted",
      receipt_url: null,
      created_at: isoTimestamp(addDays(now, -2)),
    },
    {
      id: ID.budgetTxApproved,
      budget_account_id: ID.budgetPhilo,
      submitted_by: serviceUser.userId,
      amount: 415,
      vendor: "5K Timing Co.",
      category: "Event operations",
      description: "Timing service deposit for philanthropy run.",
      transaction_date: dateOnly(addDays(now, -7)),
      status: "approved",
      receipt_url: null,
      approved_by: treasurerUser.userId,
      approved_at: isoTimestamp(addDays(now, -5)),
      created_at: isoTimestamp(addDays(now, -7)),
    },
    {
      id: ID.budgetTxReimbursed,
      budget_account_id: ID.budgetStew,
      submitted_by: stewardUser.userId,
      amount: 72.44,
      vendor: "Grocery Market",
      category: "Supplies",
      description: "Kitchen supplies for wait-on meals.",
      transaction_date: dateOnly(addDays(now, -10)),
      status: "reimbursed",
      receipt_url: null,
      approved_by: treasurerUser.userId,
      approved_at: isoTimestamp(addDays(now, -8)),
      created_at: isoTimestamp(addDays(now, -10)),
    },
  ]);

  await insertRows(client, "wait_on_schedules", [
    {
      id: ID.waitOnSchedule,
      week_start: dateOnly(waitOnWeekStart),
      published: true,
      created_by: stewardUser.userId,
      created_at: isoTimestamp(addDays(now, -1)),
      updated_at: isoTimestamp(addHours(now, -2)),
    },
  ]);

  await insertRows(client, "wait_on_assignments", [
    {
      id: ID.waitOnMondayLunch,
      schedule_id: ID.waitOnSchedule,
      slot_key: "monday_lunch",
      brother_id: userAt(users, 0).userId,
      created_at: isoTimestamp(addHours(now, -2)),
    },
    {
      id: ID.waitOnMondayDinner,
      schedule_id: ID.waitOnSchedule,
      slot_key: "monday_dinner",
      brother_id: secondUser.userId,
      created_at: isoTimestamp(addHours(now, -2)),
    },
    {
      id: ID.waitOnTuesdayDinner,
      schedule_id: ID.waitOnSchedule,
      slot_key: "tuesday_dinner",
      brother_id: thirdUser.userId,
      created_at: isoTimestamp(addHours(now, -2)),
    },
  ]);

  await insertRows(client, "emergency_contacts", [
    {
      id: ID.emergencyPrimary,
      user_id: adminUser.userId,
      contact_type: "parent",
      name: "Jordan Demo",
      phone: "555-1100",
      email: "jordan.demo@example.com",
      created_at: isoTimestamp(addDays(now, -9)),
      updated_at: isoTimestamp(addDays(now, -9)),
    },
    {
      id: ID.emergencySecondary,
      user_id: secondUser.userId,
      contact_type: "sibling",
      name: "Taylor Demo",
      phone: "555-1101",
      email: "taylor.demo@example.com",
      created_at: isoTimestamp(addDays(now, -8)),
      updated_at: isoTimestamp(addDays(now, -8)),
    },
  ]);

  await insertRows(client, "transactions", [
    {
      id: ID.legacyTransaction,
      budget_id: ID.legacyBudget,
      amount: 135.5,
      vendor: "Demo Vendor",
      date: isoTimestamp(addDays(now, -15)),
      created_by: adminUser.userId,
    },
  ]);
}

function ensureDemoResetAllowed(req: VercelRequest): void {
  const appEnvironment = normalizeAppEnvironment(process.env.APP_ENV ?? process.env.VITE_APP_ENV);

  if (appEnvironment !== "demo") {
    throw new DemoResetHttpError(403, "Demo reset is only available when APP_ENV or VITE_APP_ENV is demo");
  }

  if (getOptionalEnv("DEMO_RESET_ENABLED")?.toLowerCase() !== "true") {
    throw new DemoResetHttpError(403, "Demo reset is disabled");
  }

  if (getHeader(req, "x-demo-reset") !== DEMO_RESET_HEADER) {
    throw new DemoResetHttpError(403, "Demo reset request header is missing");
  }

  if (!isSameOriginRequest(req)) {
    throw new DemoResetHttpError(403, "Demo reset requests must be same-origin");
  }
}

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, error: "Method not allowed" });
    return;
  }

  try {
    ensureDemoResetAllowed(req);

    const users = parseDemoUsers();
    const client = createClient(getSupabaseUrl(), getSupabaseSecretKey(), {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    await resetPublicTables(client);
    await seedDemoData(client, users);

    sendJson(res, 200, {
      ok: true,
      seededUsers: users.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Demo reset failed";
    const status = error instanceof DemoResetHttpError ? error.statusCode : 500;

    sendJson(res, status, {
      ok: false,
      error: message,
    });
  }
}
