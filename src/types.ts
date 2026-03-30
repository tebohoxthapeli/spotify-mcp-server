export type SpotifyArtist = Readonly<{
  id: string;
  name: string;
  uri: string;
}>;

export type SpotifyAlbum = Readonly<{
  id: string;
  name: string;
  uri: string;
}>;

export type SpotifyTrack = Readonly<{
  album: SpotifyAlbum;
  artists: readonly SpotifyArtist[];
  duration_ms: number;
  external_urls: Readonly<{
    spotify: string;
  }>;
  id: string;
  name: string;
  uri: string;
}>;

export type SpotifyDevice = Readonly<{
  id: string | null;
  is_active: boolean;
  name: string;
  type: string;
  volume_percent: number | null;
}>;

export type SpotifyCurrentlyPlaying = Readonly<{
  currently_playing_type: string;
  is_playing: boolean;
  item: SpotifyTrack | null;
  progress_ms: number | null;
}>;

export type SpotifyPlayerState = Readonly<{
  device: SpotifyDevice;
  is_playing: boolean;
  item: SpotifyTrack | null;
  progress_ms: number | null;
  repeat_state: "off" | "track" | "context";
  shuffle_state: boolean;
}>;

export type SpotifyTokenResponse = Readonly<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
}>;

export type SpotifyPlaylistOwner = Readonly<{
  display_name: string | null;
  id: string;
}>;

export type SpotifyImage = Readonly<{
  height: number | null;
  url: string;
  width: number | null;
}>;

export type SpotifyPlaylist = Readonly<{
  collaborative: boolean;
  description: string | null;
  external_urls: Readonly<{
    spotify: string;
  }>;
  id: string;
  images: readonly SpotifyImage[];
  name: string;
  owner: SpotifyPlaylistOwner;
  public: boolean | null;
  snapshot_id: string;
  tracks: Readonly<{
    total: number;
  }> | null;
  uri: string;
}>;

export type SpotifyPlaylistPage = Readonly<{
  items: readonly SpotifyPlaylist[];
  limit: number;
  next: string | null;
  offset: number;
  total: number;
}>;

export type SpotifyPlaylistTrackItem = Readonly<{
  added_at: string;
  item: SpotifyTrack | null;
}>;

export type SpotifyPlaylistTracksPage = Readonly<{
  items: readonly SpotifyPlaylistTrackItem[];
  limit: number;
  next: string | null;
  offset: number;
  total: number;
}>;

export type SpotifyPaginatedResult<T> = Readonly<{
  items: readonly T[];
  limit: number;
  next: string | null;
  offset: number;
  total: number;
}>;

export type SpotifySearchArtist = Readonly<{
  genres?: readonly string[];
  id: string;
  name: string;
  popularity?: number;
  uri: string;
}>;

export type SpotifySearchResult = Readonly<{
  albums?: SpotifyPaginatedResult<SpotifyAlbum>;
  artists?: SpotifyPaginatedResult<SpotifySearchArtist>;
  playlists?: SpotifyPaginatedResult<SpotifyPlaylist>;
  tracks?: SpotifyPaginatedResult<SpotifyTrack>;
}>;

export type SpotifyPlayHistoryItem = Readonly<{
  played_at: string;
  track: SpotifyTrack;
}>;

export type SpotifyCursorPage<T> = Readonly<{
  cursors: Readonly<{
    after: string;
    before: string;
  }> | null;
  items: readonly T[];
  limit: number;
  next: string | null;
  total: number;
}>;

export type SpotifyTopTracksResponse = Readonly<{
  tracks: readonly SpotifyTrack[];
}>;

export type SpotifyTracksResponse = Readonly<{
  tracks: readonly (SpotifyTrack | null)[];
}>;

export type SpotifySimplifiedTrack = Readonly<{
  artists: readonly SpotifyArtist[];
  duration_ms: number;
  external_urls: Readonly<{
    spotify: string;
  }>;
  id: string;
  name: string;
  uri: string;
}>;

export type SpotifyUserProfile = Readonly<{
  display_name: string | null;
  email?: string;
  country?: string;
  external_urls: Readonly<{
    spotify: string;
  }>;
  followers?: Readonly<{
    total: number;
  }>;
  id: string;
  images: readonly SpotifyImage[];
  product?: string;
  uri: string;
}>;

export type SpotifyTopItemsResponse<T> = Readonly<{
  items: readonly T[];
  limit: number;
  next: string | null;
  offset: number;
  total: number;
}>;

export type SpotifyFollowedArtistsResponse = Readonly<{
  artists: Readonly<{
    cursors: Readonly<{
      after: string | null;
    }> | null;
    items: readonly SpotifySearchArtist[];
    limit: number;
    next: string | null;
    total: number;
  }>;
}>;
