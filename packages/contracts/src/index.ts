export type Event = {
  id: string;
  name: string;
  description: string;
  start_time: string;
  end_time: string;
};

export type Session = {
  id: string;
  event_id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  room: string;
  speaker: string;
  track: string;
};

export type User = {
  id: string;
  openid: string;
  nickname: string;
};

export type Ticket = {
  id: string;
  user_id: string;
  event_id: string;
  qr_token: string;
};

export type Checkin = {
  id: string;
  user_id: string;
  session_id: string;
  created_at: string;
};
