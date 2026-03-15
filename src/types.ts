export interface SpotifyArtist {
  readonly id: string;
  readonly name: string;
  readonly uri: string;
}

export interface SpotifyAlbum {
  readonly id: string;
  readonly name: string;
  readonly uri: string;
}

export interface SpotifyTrack {
  readonly album: SpotifyAlbum;
  readonly artists: readonly SpotifyArtist[];
  readonly duration_ms: number;
  readonly external_urls: {
    readonly spotify: string;
  };
  readonly id: string;
  readonly name: string;
  readonly uri: string;
}

export interface SpotifyDevice {
  readonly id: string | null;
  readonly is_active: boolean;
  readonly name: string;
  readonly type: string;
  readonly volume_percent: number | null;
}

export interface SpotifyCurrentlyPlaying {
  readonly currently_playing_type: string;
  readonly is_playing: boolean;
  readonly item: SpotifyTrack | null;
  readonly progress_ms: number | null;
}

export interface SpotifyPlayerState {
  readonly device: SpotifyDevice;
  readonly is_playing: boolean;
  readonly item: SpotifyTrack | null;
  readonly progress_ms: number | null;
  readonly repeat_state: "off" | "track" | "context";
  readonly shuffle_state: boolean;
}

export interface SpotifyTokenResponse {
  readonly access_token: string;
  readonly expires_in: number;
  readonly refresh_token?: string;
  readonly scope: string;
  readonly token_type: string;
}

export interface SpotifyPlaylistOwner {
  readonly display_name: string | null;
  readonly id: string;
}

export interface SpotifyImage {
  readonly height: number | null;
  readonly url: string;
  readonly width: number | null;
}

export interface SpotifyPlaylist {
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
  };
  readonly uri: string;
}

export interface SpotifyPlaylistPage {
  readonly items: readonly SpotifyPlaylist[];
  readonly limit: number;
  readonly next: string | null;
  readonly offset: number;
  readonly total: number;
}

export interface SpotifyPlaylistTrackItem {
  readonly added_at: string;
  readonly track: SpotifyTrack | null;
}

export interface SpotifyPlaylistTracksPage {
  readonly items: readonly SpotifyPlaylistTrackItem[];
  readonly limit: number;
  readonly next: string | null;
  readonly offset: number;
  readonly total: number;
}
