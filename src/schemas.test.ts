import { describe, expect, test } from "bun:test";
import { z } from "zod";
import {
  addTracksInput,
  createPlaylistInput,
  deletePlaylistInput,
  getPlaylistsInput,
  getPlaylistTracksInput,
  playTrackInput,
  removeTracksInput,
  reorderPlaylistTracksInput,
  setPositionInput,
  setRepeatInput,
  setShuffleInput,
  setVolumeInput,
  updatePlaylistInput,
} from "./schemas.js";

// Helper to wrap the raw shape objects into z.object for parsing
function parse<T extends z.ZodRawShape>(shape: T, data: unknown) {
  return z.object(shape).safeParse(data);
}

describe("playTrackInput", () => {
  test("valid URI passes", () => {
    const result = parse(playTrackInput, {
      uri: "spotify:track:4iV5W9uYEdYUVa79Axb7Rh",
    });
    expect(result.success).toBe(true);
  });

  test("invalid URI format fails", () => {
    const result = parse(playTrackInput, {
      uri: "not-a-uri",
    });
    expect(result.success).toBe(false);
  });

  test("context is optional", () => {
    const result = parse(playTrackInput, {
      uri: "spotify:track:abc123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.context).toBeUndefined();
    }
  });

  test("context with valid URI passes", () => {
    const result = parse(playTrackInput, {
      context: "spotify:album:def456",
      uri: "spotify:track:abc123",
    });
    expect(result.success).toBe(true);
  });

  test("context with invalid URI fails", () => {
    const result = parse(playTrackInput, {
      context: "garbage",
      uri: "spotify:track:abc123",
    });
    expect(result.success).toBe(false);
  });
});

describe("setPositionInput", () => {
  test("valid positive number passes", () => {
    const result = parse(setPositionInput, {
      position: 30,
    });
    expect(result.success).toBe(true);
  });

  test("zero passes", () => {
    const result = parse(setPositionInput, {
      position: 0,
    });
    expect(result.success).toBe(true);
  });

  test("negative number fails", () => {
    const result = parse(setPositionInput, {
      position: -1,
    });
    expect(result.success).toBe(false);
  });

  test("decimal value passes", () => {
    const result = parse(setPositionInput, {
      position: 1.5,
    });
    expect(result.success).toBe(true);
  });
});

describe("setVolumeInput", () => {
  test("valid range value (50) passes", () => {
    const result = parse(setVolumeInput, {
      volume: 50,
    });
    expect(result.success).toBe(true);
  });

  test("boundary value 0 passes", () => {
    const result = parse(setVolumeInput, {
      volume: 0,
    });
    expect(result.success).toBe(true);
  });

  test("boundary value 100 passes", () => {
    const result = parse(setVolumeInput, {
      volume: 100,
    });
    expect(result.success).toBe(true);
  });

  test("over 100 fails", () => {
    const result = parse(setVolumeInput, {
      volume: 101,
    });
    expect(result.success).toBe(false);
  });

  test("under 0 fails", () => {
    const result = parse(setVolumeInput, {
      volume: -1,
    });
    expect(result.success).toBe(false);
  });

  test("non-integer fails", () => {
    const result = parse(setVolumeInput, {
      volume: 50.5,
    });
    expect(result.success).toBe(false);
  });
});

describe("setShuffleInput", () => {
  test("true passes", () => {
    const result = parse(setShuffleInput, {
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  test("false passes", () => {
    const result = parse(setShuffleInput, {
      enabled: false,
    });
    expect(result.success).toBe(true);
  });

  test("non-boolean fails", () => {
    const result = parse(setShuffleInput, {
      enabled: "yes",
    });
    expect(result.success).toBe(false);
  });
});

describe("setRepeatInput", () => {
  test("true passes", () => {
    const result = parse(setRepeatInput, {
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  test("false passes", () => {
    const result = parse(setRepeatInput, {
      enabled: false,
    });
    expect(result.success).toBe(true);
  });

  test("non-boolean fails", () => {
    const result = parse(setRepeatInput, {
      enabled: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("getPlaylistsInput", () => {
  test("defaults: limit=20, offset=0", () => {
    const result = parse(getPlaylistsInput, {});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.offset).toBe(0);
    }
  });

  test("custom values pass", () => {
    const result = parse(getPlaylistsInput, {
      limit: 10,
      offset: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
      expect(result.data.offset).toBe(5);
    }
  });

  test("limit of 0 fails (min is 1)", () => {
    const result = parse(getPlaylistsInput, {
      limit: 0,
    });
    expect(result.success).toBe(false);
  });

  test("limit of 51 fails (max is 50)", () => {
    const result = parse(getPlaylistsInput, {
      limit: 51,
    });
    expect(result.success).toBe(false);
  });

  test("negative offset fails", () => {
    const result = parse(getPlaylistsInput, {
      offset: -1,
    });
    expect(result.success).toBe(false);
  });
});

describe("getPlaylistTracksInput", () => {
  test("valid playlist URI passes", () => {
    const result = parse(getPlaylistTracksInput, {
      uri: "spotify:playlist:abc123",
    });
    expect(result.success).toBe(true);
  });

  test("non-playlist URI fails", () => {
    const result = parse(getPlaylistTracksInput, {
      uri: "spotify:track:abc123",
    });
    expect(result.success).toBe(false);
  });

  test("defaults: limit=50, offset=0", () => {
    const result = parse(getPlaylistTracksInput, {
      uri: "spotify:playlist:abc123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
      expect(result.data.offset).toBe(0);
    }
  });

  test("limit over 100 fails", () => {
    const result = parse(getPlaylistTracksInput, {
      limit: 101,
      uri: "spotify:playlist:abc123",
    });
    expect(result.success).toBe(false);
  });
});

describe("createPlaylistInput", () => {
  test("name is required and min length 1", () => {
    const result = parse(createPlaylistInput, {
      name: "My Playlist",
    });
    expect(result.success).toBe(true);
  });

  test("defaults: public=false, collaborative=false", () => {
    const result = parse(createPlaylistInput, {
      name: "Test",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.public).toBe(false);
      expect(result.data.collaborative).toBe(false);
    }
  });

  test("empty name fails", () => {
    const result = parse(createPlaylistInput, {
      name: "",
    });
    expect(result.success).toBe(false);
  });

  test("missing name fails", () => {
    const result = parse(createPlaylistInput, {});
    expect(result.success).toBe(false);
  });

  test("description is optional", () => {
    const result = parse(createPlaylistInput, {
      description: "A cool playlist",
      name: "Test",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.description).toBe("A cool playlist");
    }
  });
});

describe("deletePlaylistInput", () => {
  test("valid playlist URI passes", () => {
    const result = parse(deletePlaylistInput, {
      uri: "spotify:playlist:abc123",
    });
    expect(result.success).toBe(true);
  });

  test("non-playlist URI fails", () => {
    const result = parse(deletePlaylistInput, {
      uri: "spotify:track:abc123",
    });
    expect(result.success).toBe(false);
  });

  test("missing URI fails", () => {
    const result = parse(deletePlaylistInput, {});
    expect(result.success).toBe(false);
  });
});

describe("addTracksInput", () => {
  test("valid playlist + track URIs passes", () => {
    const result = parse(addTracksInput, {
      playlist_uri: "spotify:playlist:abc123",
      track_uris: [
        "spotify:track:t1",
        "spotify:track:t2",
      ],
    });
    expect(result.success).toBe(true);
  });

  test("non-track URI in array fails", () => {
    const result = parse(addTracksInput, {
      playlist_uri: "spotify:playlist:abc123",
      track_uris: [
        "spotify:album:notATrack",
      ],
    });
    expect(result.success).toBe(false);
  });

  test("empty track_uris array fails", () => {
    const result = parse(addTracksInput, {
      playlist_uri: "spotify:playlist:abc123",
      track_uris: [],
    });
    expect(result.success).toBe(false);
  });

  test("non-playlist URI for playlist_uri fails", () => {
    const result = parse(addTracksInput, {
      playlist_uri: "spotify:track:abc123",
      track_uris: [
        "spotify:track:t1",
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("removeTracksInput", () => {
  test("valid with snapshot_id", () => {
    const result = parse(removeTracksInput, {
      playlist_uri: "spotify:playlist:abc123",
      snapshot_id: "snap123",
      track_uris: [
        "spotify:track:t1",
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.snapshot_id).toBe("snap123");
    }
  });

  test("valid without snapshot_id", () => {
    const result = parse(removeTracksInput, {
      playlist_uri: "spotify:playlist:abc123",
      track_uris: [
        "spotify:track:t1",
      ],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.snapshot_id).toBeUndefined();
    }
  });

  test("empty track_uris array fails", () => {
    const result = parse(removeTracksInput, {
      playlist_uri: "spotify:playlist:abc123",
      track_uris: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("updatePlaylistInput", () => {
  test("only URI required, all other fields optional", () => {
    const result = parse(updatePlaylistInput, {
      uri: "spotify:playlist:abc123",
    });
    expect(result.success).toBe(true);
  });

  test("all optional fields accepted", () => {
    const result = parse(updatePlaylistInput, {
      collaborative: false,
      description: "New Description",
      name: "New Name",
      public: true,
      uri: "spotify:playlist:abc123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("New Name");
      expect(result.data.description).toBe("New Description");
      expect(result.data.public).toBe(true);
      expect(result.data.collaborative).toBe(false);
    }
  });

  test("missing URI fails", () => {
    const result = parse(updatePlaylistInput, {
      name: "No URI",
    });
    expect(result.success).toBe(false);
  });

  test("empty name fails (min 1 char)", () => {
    const result = parse(updatePlaylistInput, {
      name: "",
      uri: "spotify:playlist:abc123",
    });
    expect(result.success).toBe(false);
  });
});

describe("reorderPlaylistTracksInput", () => {
  test("valid reorder with defaults", () => {
    const result = parse(reorderPlaylistTracksInput, {
      insert_before: 3,
      range_start: 0,
      uri: "spotify:playlist:abc123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.range_length).toBe(1);
      expect(result.data.snapshot_id).toBeUndefined();
    }
  });

  test("custom range_length and snapshot_id", () => {
    const result = parse(reorderPlaylistTracksInput, {
      insert_before: 5,
      range_length: 3,
      range_start: 2,
      snapshot_id: "snap456",
      uri: "spotify:playlist:abc123",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.range_length).toBe(3);
      expect(result.data.snapshot_id).toBe("snap456");
    }
  });

  test("negative range_start fails", () => {
    const result = parse(reorderPlaylistTracksInput, {
      insert_before: 0,
      range_start: -1,
      uri: "spotify:playlist:abc123",
    });
    expect(result.success).toBe(false);
  });

  test("negative insert_before fails", () => {
    const result = parse(reorderPlaylistTracksInput, {
      insert_before: -1,
      range_start: 0,
      uri: "spotify:playlist:abc123",
    });
    expect(result.success).toBe(false);
  });

  test("range_length of 0 fails (min is 1)", () => {
    const result = parse(reorderPlaylistTracksInput, {
      insert_before: 3,
      range_length: 0,
      range_start: 0,
      uri: "spotify:playlist:abc123",
    });
    expect(result.success).toBe(false);
  });

  test("missing required fields fails", () => {
    const result = parse(reorderPlaylistTracksInput, {
      uri: "spotify:playlist:abc123",
    });
    expect(result.success).toBe(false);
  });
});
