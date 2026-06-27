import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { createScriptDb, readDbConfig } from "./db";
import {
  activities,
  activityOrganizers,
  activityPublications,
  blocks,
  expoBooths,
  liveEntries,
  operatorGrants,
  organizers,
  pageConfigs,
  registrationForms,
  sessionSpeakers,
  sessions,
  speakers,
  sponsors,
  staffGrants,
  surveyQuestions,
  surveys,
  tenants,
  users,
} from "../src/db/schema";

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

const smokeSeedEnvSchema = z
  .object({
    EVENTOS_DEV_AUTH_USER_ID: z.string().min(1).default("authing-dev-operator"),
    EVENTOS_DEV_AUTH_ORG_ID: z.string().min(1).default("authing-dev-org"),
  })
  .passthrough();

const isoDatetimeSchema = z.string().datetime();
const activityStatusSchema = z.enum(["draft", "published", "archived"]);
const sessionStatusSchema = z.enum(["scheduled", "cancelled", "hidden"]);
const pageKeySchema = z.enum(["home", "agenda", "assistant", "expo", "me"]);
const resourceRefSchema = z.object({
  resource_type: z.enum(["activity", "expo_booth", "sponsor"]),
  resource_id: z.string().min(1),
});
const pageConfigSeedSchema = z.object({
  id: z.string().min(1),
  activity_id: z.string().min(1),
  page_key: pageKeySchema,
  enabled: z.boolean(),
});
const blockSeedSchema = z.object({
  id: z.string().min(1),
  activity_id: z.string().min(1),
  page_config_id: z.string().min(1),
  block_key: z.string().min(1),
  enabled: z.boolean(),
  sort_order: z.number().int().min(0),
  resource_refs: z.array(resourceRefSchema),
  config: z.record(z.string(), z.unknown()),
  display_snapshot: z.record(z.string(), z.unknown()),
});
const registrationFormFieldSeedSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "phone", "email", "select", "multi_select", "boolean"]),
  required: z.boolean(),
  options: z.array(z.object({ label: z.string().min(1), value: z.string().min(1) })).optional(),
});
const smokeSeedPayloadSchema = z.object({
  authing_user_id: z.string().min(1),
  authing_org_id: z.string().min(1),
  activity: z.object({
    id: z.string().min(1),
    tenant_id: z.string().min(1),
    name: z.string().min(1),
    theme_name: z.string().min(1),
    description: z.string().min(1),
    start_time: isoDatetimeSchema,
    end_time: isoDatetimeSchema,
    timezone: z.string().min(1),
    venue: z.object({
      venue_name: z.string().min(1),
      venue_address: z.string().min(1),
      city: z.string().min(1),
      timezone: z.string().min(1),
    }),
    status: activityStatusSchema,
    theme: z.object({
      primary_color: z.string().min(1),
      button_copy: z.record(z.string(), z.string().min(1)),
    }),
    created_at: isoDatetimeSchema,
    updated_at: isoDatetimeSchema,
  }),
  session: z.object({
    id: z.string().min(1),
    activity_id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    start_time: isoDatetimeSchema,
    end_time: isoDatetimeSchema,
    timezone: z.string().min(1),
    room_name: z.string().min(1),
    venue_area: z.string().min(1),
    status: sessionStatusSchema,
    capacity: z.number().int().min(0),
    requires_reservation: z.boolean(),
    sort_order: z.number().int().min(0),
    created_at: isoDatetimeSchema,
    updated_at: isoDatetimeSchema,
  }),
  expo_booth: z.object({
    id: z.string().min(1),
    activity_id: z.string().min(1),
    sponsor_id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    category: z.string().min(1),
    location: z.string().min(1),
    logo_url: z.string().optional(),
    status: z.enum(["visible", "hidden"]),
    sort_order: z.number().int().min(0),
  }),
  page_configs: z.array(pageConfigSeedSchema).min(1),
  blocks: z.array(blockSeedSchema).min(1),
  registration_fields: z.array(registrationFormFieldSeedSchema).min(1),
});

function devEnv() {
  const env = smokeSeedEnvSchema.parse(process.env);
  return {
    authingUserId: env.EVENTOS_DEV_AUTH_USER_ID,
    authingOrgId: env.EVENTOS_DEV_AUTH_ORG_ID,
  };
}

function publicationEtag(snapshot: unknown) {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

async function main() {
  const database = createScriptDb(readDbConfig());
  const { authingUserId, authingOrgId } = devEnv();
  const now = new Date();
  const activityStart = new Date("2026-09-10T01:00:00.000Z");
  const activityEnd = new Date("2026-09-10T10:00:00.000Z");
  const sessionStart = new Date("2026-09-10T02:00:00.000Z");
  const sessionEnd = new Date("2026-09-10T03:00:00.000Z");

  const activityVenue = {
    venue_name: "Activity Operations Center",
    venue_address: "Local development venue",
    city: "Shanghai",
    timezone: "Asia/Shanghai",
  };
  const activityTheme = {
    primary_color: "#2563eb",
    button_copy: {
      register: "Register",
      live: "Watch Live",
    },
  };
  const activitySnapshot = {
    id: ids.activity,
    tenant_id: ids.tenant,
    name: "Event OS Smoke Activity",
    theme_name: "Neutral operations",
    description: "Reusable Activity workspace for local operator verification.",
    start_time: activityStart.toISOString(),
    end_time: activityEnd.toISOString(),
    timezone: "Asia/Shanghai",
    venue: activityVenue,
    status: "published",
    theme: activityTheme,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  const sessionSnapshot = {
    id: ids.session,
    activity_id: ids.activity,
    title: "Opening Session",
    description: "A structured Session for validating agenda, speaker, and check-in flows.",
    start_time: sessionStart.toISOString(),
    end_time: sessionEnd.toISOString(),
    timezone: "Asia/Shanghai",
    room_name: "Main Hall",
    venue_area: "Level 1",
    status: "scheduled",
    capacity: 200,
    requires_reservation: false,
    sort_order: 10,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  const expoBoothSnapshot = {
    id: ids.expoBooth,
    activity_id: ids.activity,
    sponsor_id: ids.sponsor,
    name: "Platform Showcase Booth",
    description: "Visible Expo Booth linked to a Sponsor for local CMS verification.",
    category: "Platform",
    location: "Expo A1",
    logo_url: undefined,
    status: "visible",
    sort_order: 10,
  };
  const pageConfigSnapshots = [
    { id: ids.pageHome, activity_id: ids.activity, page_key: "home", enabled: true },
    { id: ids.pageAgenda, activity_id: ids.activity, page_key: "agenda", enabled: true },
    { id: ids.pageExpo, activity_id: ids.activity, page_key: "expo", enabled: true },
    { id: ids.pageMe, activity_id: ids.activity, page_key: "me", enabled: true },
  ];
  const blockSnapshots = [
    {
      id: ids.blockHome,
      activity_id: ids.activity,
      page_config_id: ids.pageHome,
      block_key: "activity_overview",
      enabled: true,
      sort_order: 10,
      resource_refs: [{ resource_type: "activity", resource_id: ids.activity }],
      config: { title: "Activity Overview", copy: "Core Activity information is managed as structured data." },
      display_snapshot: { activity_name: activitySnapshot.name, venue_name: activityVenue.venue_name },
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
      display_snapshot: { booth_name: expoBoothSnapshot.name },
    },
  ];
  const publicationSnapshot = {
    activity: activitySnapshot,
    sessions: [sessionSnapshot],
    expo_booths: [expoBoothSnapshot],
    page_configs: pageConfigSnapshots.map((page) => ({
      ...page,
      blocks: blockSnapshots.filter((block) => block.page_config_id === page.id),
    })),
    generated_at: now.toISOString(),
    smoke_seed: true,
  };
  const registrationFields = [
    { id: "field_name", key: "name", label: "Name", type: "text", required: true },
    { id: "field_email", key: "email", label: "Email", type: "email", required: false },
  ];
  const payload = smokeSeedPayloadSchema.parse({
    authing_user_id: authingUserId,
    authing_org_id: authingOrgId,
    activity: activitySnapshot,
    session: sessionSnapshot,
    expo_booth: expoBoothSnapshot,
    page_configs: pageConfigSnapshots,
    blocks: blockSnapshots,
    registration_fields: registrationFields,
  });

  try {
    await database.db.transaction(async (tx) => {
      await tx.insert(tenants).values({
        id: ids.tenant,
        authingOrgId: payload.authing_org_id,
        name: "Event OS Development Tenant",
        code: "eventos-dev",
        status: "active",
      }).onConflictDoUpdate({
        target: tenants.id,
        set: { authingOrgId: payload.authing_org_id, name: "Event OS Development Tenant", code: "eventos-dev", status: "active" },
      });

      await tx.insert(users).values({
        id: ids.operatorUser,
        authingUserId: payload.authing_user_id,
        displayName: "Development Operator",
      }).onConflictDoUpdate({
        target: users.id,
        set: { authingUserId: payload.authing_user_id, displayName: "Development Operator" },
      });

      await tx.insert(users).values({
        id: ids.staffUser,
        authingUserId: "authing-dev-staff",
        displayName: "Development Staff",
      }).onConflictDoUpdate({
        target: users.id,
        set: { authingUserId: "authing-dev-staff", displayName: "Development Staff" },
      });

      await tx.insert(organizers).values({
        id: ids.organizer,
        tenantId: ids.tenant,
        name: "Event OS Organizer",
        description: "Generic organizer brand for local smoke verification.",
        websiteUrl: "https://example.com/organizer",
        contact: "ops@example.com",
      }).onConflictDoUpdate({
        target: organizers.id,
        set: {
          name: "Event OS Organizer",
          description: "Generic organizer brand for local smoke verification.",
          websiteUrl: "https://example.com/organizer",
          contact: "ops@example.com",
        },
      });

      await tx.insert(sponsors).values({
        id: ids.sponsor,
        tenantId: ids.tenant,
        name: "Platform Sponsor",
        description: "Generic sponsor brand for local smoke verification.",
        websiteUrl: "https://example.com/sponsor",
      }).onConflictDoUpdate({
        target: sponsors.id,
        set: {
          name: "Platform Sponsor",
          description: "Generic sponsor brand for local smoke verification.",
          websiteUrl: "https://example.com/sponsor",
        },
      });

      await tx.insert(speakers).values({
        id: ids.speaker,
        tenantId: ids.tenant,
        name: "Sample Speaker",
        title: "Principal Speaker",
        organization: "Event OS",
        bio: "Generic speaker profile for Session linking.",
      }).onConflictDoUpdate({
        target: speakers.id,
        set: {
          name: "Sample Speaker",
          title: "Principal Speaker",
          organization: "Event OS",
          bio: "Generic speaker profile for Session linking.",
        },
      });

      await tx.insert(activities).values({
        id: ids.activity,
        tenantId: ids.tenant,
        name: payload.activity.name,
        themeName: payload.activity.theme_name,
        description: payload.activity.description,
        startTime: activityStart,
        endTime: activityEnd,
        timezone: payload.activity.timezone,
        venue: payload.activity.venue,
        status: payload.activity.status,
        theme: payload.activity.theme,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: activities.id,
        set: {
          name: payload.activity.name,
          themeName: payload.activity.theme_name,
          description: payload.activity.description,
          startTime: activityStart,
          endTime: activityEnd,
          timezone: payload.activity.timezone,
          venue: payload.activity.venue,
          status: payload.activity.status,
          theme: payload.activity.theme,
          updatedAt: now,
        },
      });

      await tx.insert(activityOrganizers).values({
        activityId: ids.activity,
        organizerId: ids.organizer,
        sortOrder: 10,
      }).onConflictDoUpdate({
        target: [activityOrganizers.activityId, activityOrganizers.organizerId],
        set: { sortOrder: 10 },
      });

      await tx.insert(sessions).values({
        id: ids.session,
        activityId: ids.activity,
        title: payload.session.title,
        description: payload.session.description,
        startTime: sessionStart,
        endTime: sessionEnd,
        timezone: payload.session.timezone,
        roomName: payload.session.room_name,
        venueArea: payload.session.venue_area,
        status: payload.session.status,
        capacity: payload.session.capacity,
        requiresReservation: payload.session.requires_reservation,
        sortOrder: payload.session.sort_order,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: sessions.id,
        set: {
          title: payload.session.title,
          description: payload.session.description,
          startTime: sessionStart,
          endTime: sessionEnd,
          timezone: payload.session.timezone,
          roomName: payload.session.room_name,
          venueArea: payload.session.venue_area,
          status: payload.session.status,
          capacity: payload.session.capacity,
          requiresReservation: payload.session.requires_reservation,
          sortOrder: payload.session.sort_order,
          updatedAt: now,
        },
      });

      await tx.insert(sessionSpeakers).values({
        sessionId: ids.session,
        speakerId: ids.speaker,
        role: "speaker",
        sortOrder: 10,
      }).onConflictDoUpdate({
        target: [sessionSpeakers.sessionId, sessionSpeakers.speakerId],
        set: { role: "speaker", sortOrder: 10 },
      });

      await tx.insert(expoBooths).values({
        id: ids.expoBooth,
        activityId: ids.activity,
        sponsorId: ids.sponsor,
        name: payload.expo_booth.name,
        description: payload.expo_booth.description,
        category: payload.expo_booth.category,
        location: payload.expo_booth.location,
        logoUrl: null,
        status: payload.expo_booth.status,
        sortOrder: payload.expo_booth.sort_order,
      }).onConflictDoUpdate({
        target: expoBooths.id,
        set: {
          sponsorId: ids.sponsor,
          name: payload.expo_booth.name,
          description: payload.expo_booth.description,
          category: payload.expo_booth.category,
          location: payload.expo_booth.location,
          logoUrl: null,
          status: payload.expo_booth.status,
          sortOrder: payload.expo_booth.sort_order,
        },
      });

      await tx.insert(registrationForms).values({
        id: ids.registrationForm,
        activityId: ids.activity,
        title: "Default Registration Form",
        fields: payload.registration_fields,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: registrationForms.id,
        set: {
          title: "Default Registration Form",
          fields: payload.registration_fields,
          updatedAt: now,
        },
      });

      for (const page of payload.page_configs) {
        await tx.insert(pageConfigs).values({
          id: page.id,
          activityId: page.activity_id,
          pageKey: page.page_key,
          enabled: page.enabled,
          updatedAt: now,
        }).onConflictDoUpdate({
          target: [pageConfigs.activityId, pageConfigs.pageKey],
          set: { enabled: page.enabled, updatedAt: now },
        });
      }

      for (const block of payload.blocks) {
        await tx.insert(blocks).values({
          id: block.id,
          activityId: block.activity_id,
          pageConfigId: block.page_config_id,
          blockKey: block.block_key,
          enabled: block.enabled,
          sortOrder: block.sort_order,
          resourceRefs: block.resource_refs,
          config: block.config,
          displaySnapshot: block.display_snapshot,
        }).onConflictDoUpdate({
          target: blocks.id,
          set: {
            pageConfigId: block.page_config_id,
            blockKey: block.block_key,
            enabled: block.enabled,
            sortOrder: block.sort_order,
            resourceRefs: block.resource_refs,
            config: block.config,
            displaySnapshot: block.display_snapshot,
          },
        });
      }

      await tx.insert(liveEntries).values({
        id: ids.liveEntry,
        activityId: ids.activity,
        sessionId: ids.session,
        title: "Opening Session Live Entry",
        provider: "external_link",
        url: "https://example.com/live",
        accessPolicy: "public",
        startTime: sessionStart,
        endTime: sessionEnd,
        status: "scheduled",
        sortOrder: 10,
      }).onConflictDoUpdate({
        target: liveEntries.id,
        set: {
          sessionId: ids.session,
          title: "Opening Session Live Entry",
          provider: "external_link",
          url: "https://example.com/live",
          accessPolicy: "public",
          startTime: sessionStart,
          endTime: sessionEnd,
          status: "scheduled",
          sortOrder: 10,
        },
      });

      await tx.insert(surveys).values({
        id: ids.survey,
        activityId: ids.activity,
        title: "Activity Feedback Survey",
        description: "Draft survey resource for operator management verification.",
        targetType: "activity",
        accessPolicy: "confirmed_registration",
        status: "draft",
      }).onConflictDoUpdate({
        target: surveys.id,
        set: {
          title: "Activity Feedback Survey",
          description: "Draft survey resource for operator management verification.",
          targetType: "activity",
          targetId: null,
          accessPolicy: "confirmed_registration",
          status: "draft",
        },
      });

      await tx.insert(surveyQuestions).values({
        id: ids.surveyQuestion,
        activityId: ids.activity,
        surveyId: ids.survey,
        key: "overall_rating",
        label: "Overall rating",
        type: "rating",
        required: true,
        options: null,
        sortOrder: 10,
      }).onConflictDoUpdate({
        target: [surveyQuestions.surveyId, surveyQuestions.key],
        set: {
          label: "Overall rating",
          type: "rating",
          required: true,
          options: null,
          sortOrder: 10,
        },
      });

      await tx.insert(operatorGrants).values({
        id: ids.operatorGrant,
        tenantId: ids.tenant,
        userId: ids.operatorUser,
        authingUserId: payload.authing_user_id,
        scope: "tenant",
        grantSource: "authing",
      }).onConflictDoUpdate({
        target: operatorGrants.id,
        set: { authingUserId: payload.authing_user_id, grantSource: "authing" },
      });

      await tx.insert(staffGrants).values({
        id: ids.staffGrant,
        tenantId: ids.tenant,
        activityId: ids.activity,
        userId: ids.staffUser,
        authingUserId: "authing-dev-staff",
        grantSource: "authing",
      }).onConflictDoUpdate({
        target: [staffGrants.activityId, staffGrants.userId],
        set: { authingUserId: "authing-dev-staff", grantSource: "authing" },
      });

      await tx.update(activityPublications)
        .set({ status: "superseded" })
        .where(eq(activityPublications.activityId, ids.activity));

      await tx.insert(activityPublications).values({
        id: ids.publication,
        activityId: ids.activity,
        version: 1,
        status: "published",
        publishedByUserId: ids.operatorUser,
        summary: "Smoke seed initial publication",
        snapshot: publicationSnapshot,
        etag: publicationEtag(publicationSnapshot),
        publishedAt: now,
      }).onConflictDoUpdate({
        target: activityPublications.id,
        set: {
          status: "published",
          publishedByUserId: ids.operatorUser,
          summary: "Smoke seed initial publication",
          snapshot: publicationSnapshot,
          etag: publicationEtag(publicationSnapshot),
          publishedAt: now,
        },
      });
    });

    console.log("seeded smoke workspace");
    console.log(`tenant authing_org_id=${authingOrgId}`);
    console.log(`operator token user=${authingUserId}`);
  } finally {
    await database.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
