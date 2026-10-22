export type KKPhimListMovie = {
  name: string;
  slug: string;
  origin_name: string;
  thumb_url: string;
  poster_url: string;
  year: number;
  time?: string;
  quality?: string;
  lang?: string;
  episode_current?: string;
};

export type KKPhimDetailMovie = KKPhimListMovie & {
  director: string[];
  actor: string[];
  content: string;
  category: { id: string; name: string; slug: string }[];
};

export type KKPhimEpisodeItem = {
  name: string;
  slug: string;
  filename: string;
  link_embed: string;
  link_m3u8: string;
};

export type KKPhimEpisodes = {
  server_name: string;
  server_data: KKPhimEpisodeItem[];
}[];

export type GenreItem = {
  name: string;
  slug: string;
  type: string;
};

export type UserProfile = {
  id: string;
  username: string;
  email?: string;
  avatar_url?: string;
  role?: 'user' | 'admin';
  created_at?: string;
  last_seen_at?: string;
};

export type WatchRoom = {
  id: string;
  room_code: string;
  host_id: string;
  movie_slug: string;
  movie_name: string;
  status: string;
};
