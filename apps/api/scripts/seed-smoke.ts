import { createHash } from "node:crypto";
import { createPool, readDbConfig } from "./db";

const ids = {
  tenant: "ten_smoke",
  operatorUser: "usr_dev_operator",
  staffUser: "usr_dev_staff",
  organizer: "org_smoke",
  sponsor: "spn_smoke",
  speaker: "spk_smoke",
  activity: "act_smoke",
  session: "ses_smoke",
  registrationForm: "rgf_smoke",
  pageHome: "pgc_smoke_home",
  pageAgenda: "pgc_smoke_agenda",
  pageExpo: "pgc_smoke_expo",
  pageMe: "pgc_smoke_me",
  blockHome: "blk_smoke_home",
  blockExpo: "blk_smoke_expo",
  expoBooth: "exp_smoke",
  liveEntry: "liv_smoke",
  survey: "srv_smoke",
  surveyQuestion: "svq_smoke",
  operatorGrant: "opg_smoke",
  staffGrant: "sfg_smoke",
  publication: "pub_smoke_initial",
};

function devEnv() {
  return {
    authingUserId: process.env.EVENTOS_DEV_AUTH_USER_ID ?? "authing-dev-operator",
    authingOrgId: process.env.EVENTOS_DEV_AUTH_ORG_ID ?? "authing-dev-org",
  };
}

function json(value: unknown) {
  return JSON.stringify(value);
}

function publicationEtag(snapshot: unknown) {
  return createHash("sha256").update(json(snapshot)).digest("hex");
}

async function main() {
  const pool = createPool(readDbConfig());
  const client = await pool.connect();
  const { authingUserId, authingOrgId } = devEnv();
  const now = new Date().toISOString();
  const activityStart = "2026-09-10T01:00:00.000Z";
  const activityEnd = "2026-09-10T10:00:00.000Z";
  const sessionStart = "2026-09-10T02:00:00.000Z";
  const sessionEnd = "2026-09-10T03:00:00.000Z";

  const activity = {
    id: ids.activity,
    tenant_id: ids.tenant,
    name: "Event OS Smoke Activity",
    theme_name: "Neutral operations",
    description: "Reusable Activity workspace for local operator verification.",
    start_time: activityStart,
    end_time: activityEnd,
    timezone: "Asia/Shanghai",
    venue: {
      venue_name: "Activity Operations Center",
      venue_address: "Local development venue",
      city: "Shanghai",
      timezone: "Asia/Shanghai",
    },
    status: "published",
    theme: {
      primary_color: "#2563eb",
      button_copy: {
        register: "Register",
        live: "Watch Live",
      },
    },
    created_at: now,
    updated_at: now,
  };
  const session = {
    id: ids.session,
    activity_id: ids.activity,
    title: "Opening Session",
    description: "A structured Session for validating agenda, speaker, and check-in flows.",
    start_time: sessionStart,
    end_time: sessionEnd,
    timezone: "Asia/Shanghai",
    room_name: "Main Hall",
    venue_area: "Level 1",
    status: "scheduled",
    capacity: 200,
    requires_reservation: false,
    sort_order: 10,
    created_at: now,
    updated_at: now,
  };
  const expoBooth = {
    id: ids.expoBooth,
    activity_id: ids.activity,
    sponsor_id: ids.sponsor,
    name: "Platform Showcase Booth",
    description: "Visible Expo Booth linked to a Sponsor for local CMS verification.",
    category: "Platform",
    location: "Expo A1",
    logo_url: null,
    status: "visible",
    sort_order: 10,
  };
  const pageConfigs = [
    { id: ids.pageHome, activity_id: ids.activity, page_key: "home", enabled: true },
    { id: ids.pageAgenda, activity_id: ids.activity, page_key: "agenda", enabled: true },
    { id: ids.pageExpo, activity_id: ids.activity, page_key: "expo", enabled: true },
    { id: ids.pageMe, activity_id: ids.activity, page_key: "me", enabled: true },
  ];
  const blocks = [
    {
      id: ids.blockHome,
      activity_id: ids.activity,
      page_config_id: ids.pageHome,
      block_key: "activity_overview",
      enabled: true,
      sort_order: 10,
      resource_refs: [{ resource_type: "activity", resource_id: ids.activity }],
      config: { title: "Activity Overview", copy: "Core Activity information is managed as structured data." },
      display_snapshot: { activity_name: activity.name, venue_name: activity.venue.venue_name },
    },
    {
      id: ids.blockExpo,
      activity_id: ids.activity,
      page_config_id: ids.pageExpo,
      block_key: "expo_highlight",
      enabled: true,
      sort_order: 10,
      resource_refs: [
        { resource_type: "expo_booth", resource_id: ids.expoBooth },
        { resource_type: "sponsor", resource_id: ids.sponsor },
      ],
      config: { title: "Expo Highlight", copy: "Expo content references strong Sponsor and Expo Booth resources." },
      display_snapshot: { booth_name: expoBooth.name },
    },
  ];
  const publicationSnapshot = {
    activity,
    sessions: [session],
    expo_booths: [expoBooth],
    page_configs: pageConfigs.map((page) => ({
      id: page.id,
      activity_id: page.activity_id,
      page_key: page.page_key,
      enabled: page.enabled,
      blocks: blocks.filter((block) => block.page_config_id === page.id),
    })),
    generated_at: now,
    smoke_seed: true,
  };

  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO tenants (id, authing_org_id, name, code, status)
      VALUES ($1, $2, $3, $4, 'active')
      ON CONFLICT (authing_org_id) DO UPDATE
      SET name = EXCLUDED.name, code = EXCLUDED.code, status = EXCLUDED.status
      `,
      [ids.tenant, authingOrgId, "Event OS Development Tenant", "eventos-dev"],
    );

    await client.query(
      `
      INSERT INTO users (id, authing_user_id, display_name)
      VALUES ($1, $2, $3), ($4, $5, $6)
      ON CONFLICT (authing_user_id) DO UPDATE
      SET display_name = EXCLUDED.display_name
      `,
      [ids.operatorUser, authingUserId, "Development Operator", ids.staffUser, "authing-dev-staff", "Development Staff"],
    );

    await client.query(
      `
      INSERT INTO organizers (id, tenant_id, name, description, website_url, contact)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, description = EXCLUDED.description, website_url = EXCLUDED.website_url, contact = EXCLUDED.contact
      `,
      [ids.organizer, ids.tenant, "Event OS Organizer", "Generic organizer brand for local smoke verification.", "https://example.com/organizer", "ops@example.com"],
    );

    await client.query(
      `
      INSERT INTO sponsors (id, tenant_id, name, description, website_url)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, description = EXCLUDED.description, website_url = EXCLUDED.website_url
      `,
      [ids.sponsor, ids.tenant, "Platform Sponsor", "Generic sponsor brand for local smoke verification.", "https://example.com/sponsor"],
    );

    await client.query(
      `
      INSERT INTO speakers (id, tenant_id, name, title, organization, bio)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name, title = EXCLUDED.title, organization = EXCLUDED.organization, bio = EXCLUDED.bio
      `,
      [ids.speaker, ids.tenant, "Sample Speaker", "Principal Speaker", "Event OS", "Generic speaker profile for Session linking."],
    );

    await client.query(
      `
      INSERT INTO activities (id, tenant_id, name, theme_name, description, start_time, end_time, timezone, venue, status, theme, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8, $9::jsonb, $10, $11::jsonb, now())
      ON CONFLICT (id) DO UPDATE
      SET name = EXCLUDED.name,
          theme_name = EXCLUDED.theme_name,
          description = EXCLUDED.description,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          timezone = EXCLUDED.timezone,
          venue = EXCLUDED.venue,
          status = EXCLUDED.status,
          theme = EXCLUDED.theme,
          updated_at = now()
      `,
      [activity.id, activity.tenant_id, activity.name, activity.theme_name, activity.description, activity.start_time, activity.end_time, activity.timezone, json(activity.venue), activity.status, json(activity.theme)],
    );

    await client.query(
      `
      INSERT INTO activity_organizers (activity_id, organizer_id, sort_order)
      VALUES ($1, $2, 10)
      ON CONFLICT (activity_id, organizer_id) DO UPDATE
      SET sort_order = EXCLUDED.sort_order
      `,
      [ids.activity, ids.organizer],
    );

    await client.query(
      `
      INSERT INTO sessions (id, activity_id, title, description, start_time, end_time, timezone, room_name, venue_area, status, capacity, requires_reservation, sort_order, updated_at)
      VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8, $9, $10, $11, $12, $13, now())
      ON CONFLICT (id) DO UPDATE
      SET title = EXCLUDED.title,
          description = EXCLUDED.description,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          timezone = EXCLUDED.timezone,
          room_name = EXCLUDED.room_name,
          venue_area = EXCLUDED.venue_area,
          status = EXCLUDED.status,
          capacity = EXCLUDED.capacity,
          requires_reservation = EXCLUDED.requires_reservation,
          sort_order = EXCLUDED.sort_order,
          updated_at = now()
      `,
      [session.id, session.activity_id, session.title, session.description, session.start_time, session.end_time, session.timezone, session.room_name, session.venue_area, session.status, session.capacity, session.requires_reservation, session.sort_order],
    );

    await client.query(
      `
      INSERT INTO session_speakers (session_id, speaker_id, role, sort_order)
      VALUES ($1, $2, 'speaker', 10)
      ON CONFLICT (session_id, speaker_id) DO UPDATE
      SET role = EXCLUDED.role, sort_order = EXCLUDED.sort_order
      `,
      [ids.session, ids.speaker],
    );

    await client.query(
      `
      INSERT INTO expo_booths (id, activity_id, sponsor_id, name, description, category, location, logo_url, status, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE
      SET sponsor_id = EXCLUDED.sponsor_id,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          location = EXCLUDED.location,
          logo_url = EXCLUDED.logo_url,
          status = EXCLUDED.status,
          sort_order = EXCLUDED.sort_order
      `,
      [expoBooth.id, expoBooth.activity_id, expoBooth.sponsor_id, expoBooth.name, expoBooth.description, expoBooth.category, expoBooth.location, expoBooth.logo_url, expoBooth.status, expoBooth.sort_order],
    );

    await client.query(
      `
      INSERT INTO registration_forms (id, activity_id, title, fields, updated_at)
      VALUES ($1, $2, $3, $4::jsonb, now())
      ON CONFLICT (id) DO UPDATE
      SET title = EXCLUDED.title, fields = EXCLUDED.fields, updated_at = now()
      `,
      [
        ids.registrationForm,
        ids.activity,
        "Default Registration Form",
        json([
          { id: "field_name", key: "name", label: "Name", type: "text", required: true },
          { id: "field_email", key: "email", label: "Email", type: "email", required: false },
        ]),
      ],
    );

    for (const page of pageConfigs) {
      await client.query(
        `
        INSERT INTO page_configs (id, activity_id, page_key, enabled, updated_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (activity_id, page_key) DO UPDATE
        SET enabled = EXCLUDED.enabled, updated_at = now()
        `,
        [page.id, page.activity_id, page.page_key, page.enabled],
      );
    }

    for (const block of blocks) {
      await client.query(
        `
        INSERT INTO blocks (id, activity_id, page_config_id, block_key, enabled, sort_order, resource_refs, config, display_snapshot)
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
        ON CONFLICT (id) DO UPDATE
        SET page_config_id = EXCLUDED.page_config_id,
            block_key = EXCLUDED.block_key,
            enabled = EXCLUDED.enabled,
            sort_order = EXCLUDED.sort_order,
            resource_refs = EXCLUDED.resource_refs,
            config = EXCLUDED.config,
            display_snapshot = EXCLUDED.display_snapshot
        `,
        [block.id, block.activity_id, block.page_config_id, block.block_key, block.enabled, block.sort_order, json(block.resource_refs), json(block.config), json(block.display_snapshot)],
      );
    }

    await client.query(
      `
      INSERT INTO live_entries (id, activity_id, session_id, title, provider, url, deep_link, access_policy, start_time, end_time, status, sort_order)
      VALUES ($1, $2, $3, $4, 'external_link', $5, NULL, 'public', $6::timestamptz, $7::timestamptz, 'scheduled', 10)
      ON CONFLICT (id) DO UPDATE
      SET session_id = EXCLUDED.session_id,
          title = EXCLUDED.title,
          provider = EXCLUDED.provider,
          url = EXCLUDED.url,
          access_policy = EXCLUDED.access_policy,
          start_time = EXCLUDED.start_time,
          end_time = EXCLUDED.end_time,
          status = EXCLUDED.status,
          sort_order = EXCLUDED.sort_order
      `,
      [ids.liveEntry, ids.activity, ids.session, "Opening Session Live Entry", "https://example.com/live", sessionStart, sessionEnd],
    );

    await client.query(
      `
      INSERT INTO surveys (id, activity_id, title, description, target_type, target_id, access_policy, status)
      VALUES ($1, $2, $3, $4, 'activity', NULL, 'confirmed_registration', 'draft')
      ON CONFLICT (id) DO UPDATE
      SET title = EXCLUDED.title,
          description = EXCLUDED.description,
          target_type = EXCLUDED.target_type,
          target_id = EXCLUDED.target_id,
          access_policy = EXCLUDED.access_policy,
          status = EXCLUDED.status
      `,
      [ids.survey, ids.activity, "Activity Feedback Survey", "Draft survey resource for operator management verification."],
    );

    await client.query(
      `
      INSERT INTO survey_questions (id, activity_id, survey_id, key, label, type, required, options, sort_order)
      VALUES ($1, $2, $3, 'overall_rating', 'Overall rating', 'rating', true, NULL, 10)
      ON CONFLICT (survey_id, key) DO UPDATE
      SET label = EXCLUDED.label, type = EXCLUDED.type, required = EXCLUDED.required, options = EXCLUDED.options, sort_order = EXCLUDED.sort_order
      `,
      [ids.surveyQuestion, ids.activity, ids.survey],
    );

    await client.query(
      `
      INSERT INTO operator_grants (id, tenant_id, user_id, authing_user_id, scope, activity_id, grant_source)
      VALUES ($1, $2, $3, $4, 'tenant', NULL, 'authing')
      ON CONFLICT (tenant_id, user_id, scope, COALESCE(activity_id, '')) DO UPDATE
      SET grant_source = EXCLUDED.grant_source
      `,
      [ids.operatorGrant, ids.tenant, ids.operatorUser, authingUserId],
    );

    await client.query(
      `
      INSERT INTO staff_grants (id, tenant_id, activity_id, user_id, authing_user_id, grant_source)
      VALUES ($1, $2, $3, $4, $5, 'authing')
      ON CONFLICT (activity_id, user_id) DO UPDATE
      SET authing_user_id = EXCLUDED.authing_user_id, grant_source = EXCLUDED.grant_source
      `,
      [ids.staffGrant, ids.tenant, ids.activity, ids.staffUser, "authing-dev-staff"],
    );

    await client.query("UPDATE activity_publications SET status = 'superseded' WHERE activity_id = $1 AND status = 'published'", [ids.activity]);
    await client.query(
      `
      INSERT INTO activity_publications (id, activity_id, version, status, published_by_user_id, summary, snapshot, etag, published_at)
      VALUES ($1, $2, 1, 'published', $3, $4, $5::jsonb, $6, now())
      ON CONFLICT (id) DO UPDATE
      SET status = 'published',
          published_by_user_id = EXCLUDED.published_by_user_id,
          summary = EXCLUDED.summary,
          snapshot = EXCLUDED.snapshot,
          etag = EXCLUDED.etag,
          published_at = now()
      `,
      [ids.publication, ids.activity, ids.operatorUser, "Smoke seed initial publication", json(publicationSnapshot), publicationEtag(publicationSnapshot)],
    );

    await client.query("COMMIT");
    console.log("seeded smoke workspace");
    console.log(`tenant authing_org_id=${authingOrgId}`);
    console.log(`operator token user=${authingUserId}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
