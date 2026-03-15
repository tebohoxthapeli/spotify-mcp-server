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
