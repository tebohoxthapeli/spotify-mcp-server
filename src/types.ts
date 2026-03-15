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
	readonly id: string;
	readonly name: string;
	readonly uri: string;
	readonly duration_ms: number;
	readonly artists: readonly SpotifyArtist[];
	readonly album: SpotifyAlbum;
	readonly external_urls: { readonly spotify: string };
}

export interface SpotifyDevice {
	readonly id: string | null;
	readonly name: string;
	readonly type: string;
	readonly volume_percent: number | null;
	readonly is_active: boolean;
}

export interface SpotifyCurrentlyPlaying {
	readonly is_playing: boolean;
	readonly item: SpotifyTrack | null;
	readonly progress_ms: number | null;
	readonly currently_playing_type: string;
}

export interface SpotifyPlayerState {
	readonly is_playing: boolean;
	readonly item: SpotifyTrack | null;
	readonly progress_ms: number | null;
	readonly device: SpotifyDevice;
	readonly shuffle_state: boolean;
	readonly repeat_state: "off" | "track" | "context";
}

export interface SpotifyTokenResponse {
	readonly access_token: string;
	readonly token_type: string;
	readonly expires_in: number;
	readonly refresh_token?: string;
	readonly scope: string;
}
