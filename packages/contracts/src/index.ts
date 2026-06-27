export type Id = string;
export type ISODateTime = string;
export type TimeZone = string;

export type ApiSuccess<TData, TMeta = undefined> = TMeta extends undefined
  ? { data: TData; meta?: TMeta }
  : { data: TData; meta: TMeta };

export type ApiError = {
  error: {
    code: DomainErrorCode;
    message: string;
    details?: Record<string, unknown>;
    trace_id?: string;
  };
};

export type ApiResponse<TData, TMeta = undefined> = ApiSuccess<TData, TMeta> | ApiError;

export type CursorPageMeta = {
  next_cursor?: string;
  has_more: boolean;
  limit: number;
};

export type SortDirection = "asc" | "desc";

export type CursorListContract<TSortKey extends string, TFilter extends Record<string, unknown> = Record<string, unknown>> = {
  limit: number;
  cursor?: string;
  sort?: {
    key: TSortKey;
    direction: SortDirection;
  };
  filter?: TFilter;
};

export type OperatorActivityListContract = CursorListContract<
  "start_time" | "created_at" | "updated_at",
  {
    status?: ActivityStatus;
  }
>;

export type OperatorSessionListContract = CursorListContract<
  "start_time" | "sort_order" | "created_at",
  {
    status?: SessionStatus;
    track_id?: Id;
  }
>;

export type OperatorResourceListContract = CursorListContract<
  "created_at" | "name",
  {
    activity_id?: Id;
    status?: string;
  }
>;

export type RealtimeRecoveryContract =
  | {
      event_name: "activity.publication_updated";
      recovery_endpoint: "GET /activities/:activityId/publication";
      snapshot_resource: "activity_publication";
    }
  | {
      event_name: "session.checkin_count_updated";
      recovery_endpoint: "GET /sessions/:sessionId/checkin-count";
      snapshot_resource: "checkin";
    }
  | {
      event_name: "notification.delivered";
      recovery_endpoint: "GET /operator/activities/:activityId/notifications";
      snapshot_resource: "notification";
    };

export type CommandMeta = {
  idempotency_key: string;
};

export type DomainErrorCode =
  | "ACTIVITY_NOT_FOUND"
  | "ACTIVITY_NOT_PUBLISHED"
  | "ACTIVITY_ARCHIVED"
  | "TENANT_MISMATCH"
  | "AUTHENTICATION_REQUIRED"
  | "PERMISSION_DENIED"
  | "REGISTRATION_REQUIRED"
  | "REGISTRATION_NOT_CONFIRMED"
  | "REGISTRATION_CANCELLED"
  | "REGISTRATION_ALREADY_EXISTS"
  | "QR_PASS_INVALID"
  | "QR_PASS_EXPIRED"
  | "QR_PASS_ACTIVITY_MISMATCH"
  | "SESSION_NOT_FOUND"
  | "SESSION_NOT_CHECKINABLE"
  | "SESSION_ACTIVITY_MISMATCH"
  | "EXPO_BOOTH_NOT_FOUND"
  | "LIVE_ENTRY_NOT_FOUND"
  | "REGISTRATION_FORM_NOT_FOUND"
  | "SURVEY_NOT_FOUND"
  | "SURVEY_QUESTION_NOT_FOUND"
  | "STAFF_UNAUTHORIZED_FOR_ACTIVITY"
  | "IDEMPOTENCY_CONFLICT"
  | "VALIDATION_FAILED"
  | "PUBLISHED_VERSION_CONFLICT";

export type ActivityStatus = "draft" | "published" | "archived";
export type SessionStatus = "scheduled" | "cancelled" | "hidden";
export type RegistrationStatus = "pending" | "confirmed" | "cancelled";
export type QRPassStatus = "active" | "invalidated" | "expired";
export type CheckinSource = "staff" | "self" | "import";
export type MyAgendaSource = "manual" | "assistant" | "import" | "operator";
export type AccessPolicy = "public" | "confirmed_registration";
export type PublicationStatus = "published" | "superseded";
export type ExpoBoothStatus = "visible" | "hidden";
export type LiveEntryStatus = "draft" | "scheduled" | "live" | "ended" | "hidden";
export type NotificationStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled";
export type NotificationChannel = "miniapp" | "sms" | "email" | "wechat";

export type User = {
  id: Id;
  authing_user_id: string;
  display_name?: string;
  avatar_url?: string;
  created_at: ISODateTime;
};

export type Tenant = {
  id: Id;
  authing_org_id: string;
  name: string;
  code: string;
  status: "active" | "paused";
  created_at: ISODateTime;
};

export type Organizer = {
  id: Id;
  tenant_id: Id;
  name: string;
  logo_url?: string;
  description?: string;
  website_url?: string;
  contact?: string;
  created_at: ISODateTime;
};

export type Sponsor = {
  id: Id;
  tenant_id: Id;
  name: string;
  logo_url?: string;
  description?: string;
  website_url?: string;
  created_at: ISODateTime;
};

export type ActivityTheme = {
  primary_color?: string;
  logo_url?: string;
  cover_image_url?: string;
  button_copy?: Record<string, string>;
};

export type ActivityVenue = {
  venue_name?: string;
  venue_address?: string;
  city?: string;
  timezone: TimeZone;
};

export type Activity = {
  id: Id;
  tenant_id: Id;
  name: string;
  theme_name?: string;
  description?: string;
  start_time: ISODateTime;
  end_time: ISODateTime;
  timezone: TimeZone;
  venue: ActivityVenue;
  status: ActivityStatus;
  template_id?: Id;
  theme?: ActivityTheme;
  created_at: ISODateTime;
  updated_at: ISODateTime;
};

export type ActivityOrganizer = {
  activity_id: Id;
  organizer_id: Id;
  sort_order: number;
};

export type ActivityTemplate = {
  id: Id;
  tenant_id: Id;
  name: string;
  template_key: string;
  description?: string;
  config: Record<string, unknown>;
  created_at: ISODateTime;
};

export type Speaker = {
  id: Id;
  tenant_id: Id;
  name: string;
  title?: string;
  bio?: string;
  avatar_url?: string;
  organization?: string;
  created_at: ISODateTime;
};

export type SessionTrack = {
  id: Id;
  activity_id: Id;
  name: string;
  color?: string;
  sort_order: number;
};

export type Session = {
  id: Id;
  activity_id: Id;
  track_id?: Id;
  title: string;
  description?: string;
  start_time: ISODateTime;
  end_time: ISODateTime;
  timezone: TimeZone;
  room_name?: string;
  venue_area?: string;
  status: SessionStatus;
  capacity?: number;
  requires_reservation?: boolean;
  sort_order: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
};

export type SessionSpeaker = {
  session_id: Id;
  speaker_id: Id;
  role: "host" | "speaker" | "panelist" | "guest";
  sort_order: number;
  title_override?: string;
  bio_override?: string;
};

export type Participant = {
  id: Id;
  activity_id: Id;
  user_id: Id;
  display_name?: string;
  created_at: ISODateTime;
};

export type Registration = {
  id: Id;
  activity_id: Id;
  participant_id: Id;
  status: RegistrationStatus;
  source: "miniapp" | "operator" | "import";
  form_version_id?: Id;
  submitted_at?: ISODateTime;
  created_at: ISODateTime;
  updated_at: ISODateTime;
};

export type RegistrationForm = {
  id: Id;
  activity_id: Id;
  title: string;
  fields: RegistrationFormField[];
  created_at: ISODateTime;
  updated_at: ISODateTime;
};

export type RegistrationFormField = {
  id: Id;
  key: string;
  label: string;
  type: "text" | "phone" | "email" | "select" | "multi_select" | "boolean";
  required: boolean;
  options?: Array<{ label: string; value: string }>;
};

export type RegistrationSubmission = {
  id: Id;
  registration_id: Id;
  form_version_id: Id;
  answers: Record<string, unknown>;
  projected_fields?: Record<string, string>;
  submitted_at: ISODateTime;
};

export type QRPass = {
  id: Id;
  activity_id: Id;
  participant_id: Id;
  registration_id: Id;
  status: QRPassStatus;
  token_fingerprint: string;
  issued_at: ISODateTime;
  invalidated_at?: ISODateTime;
  expires_at?: ISODateTime;
};

export type MyAgendaItem = {
  id: Id;
  activity_id: Id;
  participant_id: Id;
  session_id: Id;
  source: MyAgendaSource;
  source_ref?: string;
  created_at: ISODateTime;
};

export type Checkin = {
  id: Id;
  activity_id: Id;
  participant_id: Id;
  session_id: Id;
  qr_pass_id: Id;
  source: CheckinSource;
  staff_user_id?: Id;
  device_metadata?: Record<string, unknown>;
  created_at: ISODateTime;
};

export type StaffCheckinCommand = CommandMeta & {
  session_id: Id;
  qr_token: string;
  device_metadata?: Record<string, unknown>;
};

export type StaffCheckinOutcome = "success" | "duplicate";

export type StaffCheckinResult = {
  outcome: StaffCheckinOutcome;
  checkin: Checkin;
  count: number;
};

export type CheckinAttempt = {
  id: Id;
  activity_id?: Id;
  session_id?: Id;
  staff_user_id?: Id;
  result: "success" | "failed";
  failure_code?: DomainErrorCode;
  metadata?: Record<string, unknown>;
  created_at: ISODateTime;
};

export type StaffGrant = {
  id: Id;
  tenant_id: Id;
  activity_id: Id;
  user_id: Id;
  authing_user_id: string;
  grant_source: "authing";
  status: "active" | "disabled";
  created_at: ISODateTime;
};

export type OperatorGrant = {
  id: Id;
  tenant_id: Id;
  user_id: Id;
  authing_user_id: string;
  scope: "tenant" | "activity";
  activity_id?: Id;
  grant_source: "authing";
  status: "active" | "disabled";
  created_at: ISODateTime;
};

export type ExpoBooth = {
  id: Id;
  activity_id: Id;
  sponsor_id?: Id;
  name: string;
  description?: string;
  category?: string;
  location?: string;
  logo_url?: string;
  status: ExpoBoothStatus;
  sort_order: number;
};

export type LiveEntry = {
  id: Id;
  activity_id: Id;
  session_id?: Id;
  title: string;
  provider: "external_link" | "miniapp_page" | "embedded" | "other";
  url?: string;
  deep_link?: string;
  access_policy: AccessPolicy;
  start_time?: ISODateTime;
  end_time?: ISODateTime;
  status: LiveEntryStatus;
  sort_order: number;
};

export type Survey = {
  id: Id;
  activity_id: Id;
  title: string;
  description?: string;
  target_type: "activity" | "session" | "expo_booth" | "live_entry";
  target_id?: Id;
  access_policy: AccessPolicy;
  status: "draft" | "published" | "closed";
};

export type SurveyQuestion = {
  id: Id;
  survey_id: Id;
  key: string;
  label: string;
  type: "text" | "single_choice" | "multiple_choice" | "rating" | "boolean";
  required: boolean;
  options?: Array<{ label: string; value: string }>;
  sort_order: number;
};

export type SurveyResponse = {
  id: Id;
  survey_id: Id;
  participant_id?: Id;
  target_type: Survey["target_type"];
  target_id?: Id;
  submitted_at: ISODateTime;
};

export type SurveyAnswer = {
  id: Id;
  response_id: Id;
  question_id: Id;
  value: unknown;
};

export type PageKey = "home" | "agenda" | "assistant" | "expo" | "me";

export type PageConfig = {
  id: Id;
  activity_id: Id;
  page_key: PageKey;
  enabled: boolean;
  blocks: Block[];
};

export type Block = {
  id: Id;
  block_key: string;
  enabled: boolean;
  sort_order: number;
  resource_refs?: Array<{
    resource_type: BusinessResourceType;
    resource_id: Id;
  }>;
  config: Record<string, unknown>;
  display_snapshot?: Record<string, unknown>;
};

export type ActivityPublication = {
  id: Id;
  activity_id: Id;
  version: number;
  status: PublicationStatus;
  published_by_user_id: Id;
  summary?: string;
  snapshot: Record<string, unknown>;
  etag: string;
  published_at: ISODateTime;
};

export type Notification = {
  id: Id;
  activity_id: Id;
  title: string;
  content: string;
  channel: NotificationChannel;
  audience_rule: NotificationAudienceRule;
  status: NotificationStatus;
  scheduled_at?: ISODateTime;
  created_at: ISODateTime;
};

export type NotificationAudienceRule =
  | { type: "all_confirmed_participants" }
  | { type: "participants_with_session_in_my_agenda"; session_id: Id }
  | { type: "staff" }
  | { type: "custom_segment"; segment_id: Id };

export type NotificationDelivery = {
  id: Id;
  notification_id: Id;
  recipient_user_id: Id;
  channel: "miniapp" | "sms" | "email" | "wechat";
  status: "pending" | "sent" | "failed" | "read";
  provider_result?: Record<string, unknown>;
  created_at: ISODateTime;
  updated_at: ISODateTime;
};

export type AuditEvent = {
  id: Id;
  tenant_id?: Id;
  activity_id?: Id;
  actor_user_id?: Id;
  actor_authing_user_id?: string;
  actor_scope?: "tenant_operator" | "activity_operator" | "staff" | "participant" | "system";
  action: string;
  resource_type: BusinessResourceType;
  resource_id?: Id;
  metadata?: Record<string, unknown>;
  created_at: ISODateTime;
};

export type BusinessResourceType =
  | "activity_template"
  | "activity"
  | "organizer"
  | "sponsor"
  | "speaker"
  | "session_track"
  | "session"
  | "registration_form"
  | "registration"
  | "qr_pass"
  | "my_agenda_item"
  | "checkin"
  | "expo_booth"
  | "live_entry"
  | "survey"
  | "page_config"
  | "block"
  | "notification"
  | "activity_publication"
  | "audit_event"
  | "staff_grant"
  | "operator_grant";

export type RealtimeEventName =
  | "session.checkin_count_updated"
  | "activity.publication_updated"
  | "notification.delivered";

export type RealtimeEvent =
  | {
      name: "session.checkin_count_updated";
      activity_id: Id;
      session_id: Id;
      count: number;
      occurred_at: ISODateTime;
    }
  | {
      name: "activity.publication_updated";
      activity_id: Id;
      publication_id: Id;
      version: number;
      etag: string;
      occurred_at: ISODateTime;
    }
  | {
      name: "notification.delivered";
      activity_id: Id;
      notification_id: Id;
      delivery_id: Id;
      occurred_at: ISODateTime;
    };
