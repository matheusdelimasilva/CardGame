// Text normalisation used when matching chart entries to MusicBrainz recordings.
export function norm(s) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ") // drop "(Remastered)", "(From ...)" etc.
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// "Mariah Carey featuring Boyz II Men" -> "Mariah Carey"; "Simon & Garfunkel" is kept whole.
export function primaryArtist(artist) {
  return artist
    .split(
      /\s+(?:featuring|feat\.?|ft\.?|with|duet with|x)\s+|\s*\/\s*|,\s+/i,
    )[0]
    .trim();
}

export function stripThe(s) {
  return s.replace(/^the /, "");
}
