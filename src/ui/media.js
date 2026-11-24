/** The file a part plays: the video with its swapped sound, else the video (Part::media() in Rust). */
export const mediaOf = (p) => p?.swap?.media ?? p?.path;
