export type SpotifyArtist = {
  readonly id: string;
  readonly name: string;
  readonly uri: string;
};

export type SpotifyAlbum = {
  readonly id: string;
  readonly name: string;
  readonly uri: string;
};

export type SpotifyTrack = {
  readonly album: SpotifyAlbum;
  readonly artists: readonly SpotifyArtist[];
  readonly duration_ms: number;
  readonly external_urls: {
    readonly spotify: string;
  };
  readonly id: string;
  readonly name: string;
  readonly uri: string;
};

export type SpotifyDevice = {
  readonly id: string | null;
  readonly is_active: boolean;
  readonly name: string;
  readonly type: string;
  readonly volume_percent: number | null;
};

export type SpotifyCurrentlyPlaying = {
  readonly currently_playing_type: string;
  readonly is_playing: boolean;
  readonly item: SpotifyTrack | null;
  readonly progress_ms: number | null;
};

export type SpotifyPlayerState = {
  readonly device: SpotifyDevice;
  readonly is_playing: boolean;
  readonly item: SpotifyTrack | null;
  readonly progress_ms: number | null;
  readonly repeat_state: "off" | "track" | "context";
  readonly shuffle_state: boolean;
};

export type SpotifyTokenResponse = {
  readonly access_token: string;
  readonly expires_in: number;
  readonly refresh_token?: string;
  readonly scope: string;
  readonly token_type: string;
};

export type SpotifyPlaylistOwner = {
  readonly display_name: string | null;
  readonly id: string;
};

export type SpotifyImage = {
  readonly height: number | null;
  readonly url: string;
  readonly width: number | null;
};

export type SpotifyPlaylist = {
  readonly collaborative: boolean;
  readonly description: string | null;
  readonly external_urls: {
    readonly spotify: string;
  };
  readonly id: string;
  readonly images: readonly SpotifyImage[];
  readonly name: string;
  readonly owner: SpotifyPlaylistOwner;
  readonly public: boolean | null;
  readonly snapshot_id: string;
  readonly tracks: {
    readonly total: number;
  } | null;
  readonly uri: string;
};

export type SpotifyPlaylistPage = {
  readonly items: readonly SpotifyPlaylist[];
  readonly limit: number;
  readonly next: string | null;
  readonly offset: number;
  readonly total: number;
};

export type SpotifyPlaylistTrackItem = {
  readonly added_at: string;
  readonly item: SpotifyTrack | null;
};

export type SpotifyPlaylistTracksPage = {
  readonly items: readonly SpotifyPlaylistTrackItem[];
  readonly limit: number;
  readonly next: string | null;
  readonly offset: number;
  readonly total: number;
};
