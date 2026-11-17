/**
 * Judges a chat line as a guess at the song in play: does it name the title
 * or the artist, come close, or neither? Pure and data-light, so it can be
 * tested on its own; the song lists only feed the Lexicon.
 *
 * Every comparison is between normalised phrases (see phrase), so case,
 * accents, punctuation, bracketed extras and "feat." credits never matter.
 */

export type Part = "title" | "artist";

/** A normalised piece of text: its words, and those words run together. */
export interface Phrase {
  words: string[];
  text: string;
}

/** One accepted way to write an answer. */
export interface AnswerForm extends Phrase {
  /** False for one or two words that are all common in song titles ("Love", "Baby Love"): finding them inside chat says little. */
  distinctive: boolean;
}

export type Answers = Record<Part, AnswerForm[]>;

/** What the song lists tell the matcher about real titles and artists. */
export interface Lexicon {
  /** Words found in many titles of one list ("love", "you", "amor"). */
  common: ReadonlySet<string>;
  /** Artists credited on their own somewhere, as artist phrases' text. */
  acts: ReadonlySet<string>;
}

export type Verdict =
  /** Names parts the player did not have yet. */
  | { kind: "credit"; parts: Part[] }
  /** Names, or comes close to, only parts the player already has. */
  | { kind: "repeat"; part: Part }
  /** Close to a part the player does not have yet, but not a match. */
  | { kind: "near" }
  /** An ordinary message. */
  | null;

/** Answers of at least this many letters forgive one typo (see matches). */
export const TYPO_MIN_LENGTH = 8;
/** A word in at least this share of a list's titles is common. */
export const COMMON_SHARE = 1 / 250;

const ARTICLES = new Set(["the", "a", "an", "o", "os", "as"]);
/** Words that join names in a credit ("Sandy & Junior", "Lil Nas X and Jack Harlow") rather than name anyone. */
const JOINERS = new Set([...ARTICLES, "and", "e", "x"]);

/**
 * Lower case without accents; "&" reads "and"; bracketed parts ("(Remastered
 * 2011)", "[Live]") and a "feat." tail are dropped; apostrophes and
 * hyphens join their word ("don't" is "dont", "A-ha" is "aha"); a leading
 * article goes ("The Beatles" is "beatles", "O Leãozinho" is "leaozinho");
 * then only letters and digits.
 */
export function phrase(raw: string): Phrase {
  const words = raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\([^()]*\)|\[[^[\]]*\]/g, " ")
    .replace(/\s+(?:feat|ft|featuring)\b.*$/s, "")
    .replace(/&/g, " and ")
    .replace(/['’‘`´]|(?<=\p{L})[-‐](?=\p{L})/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (words.length > 1 && ARTICLES.has(words[0]!)) words.shift();
  return { words, text: words.join("") };
}

/** Stands for a break between separate acts in a credit; never part of a name. */
const ACT_BREAK = "|";

/**
 * Marks every break between separate acts: "feat.", "ft.", "featuring",
 * "with", "vs.", the Portuguese "com" and "(com a) participação de" or
 * "part.", a lower-case "x" ("Anitta x Kevinho", unlike "Lil Nas X"),
 * brackets ("Marcos & Belutti (com participação de Jorge & Mateus)") and
 * " / " between double A-side credits (unlike "AC/DC").
 */
const markActs = (artist: string) =>
  artist
    .replace(/[()[\]]/g, ` ${ACT_BREAK} `)
    .replace(
      /\s+(?:(?:com\s+(?:a\s+)?)?participa[cç][aã]o\s+de|part\.|feat\.?|ft\.|featuring|with|com|vs\.?|\/)\s+/gi,
      ` ${ACT_BREAK} `,
    )
    .replace(/\s+x\s+/g, ` ${ACT_BREAK} `);

/** Acts that are certainly separate in a credit. */
const actsOf = (artist: string) =>
  markActs(artist)
    .split(ACT_BREAK)
    .filter((act) => act.trim() !== "");

/** Joints that may separate names or sit inside one ("Earth, Wind & Fire"). The Portuguese "e" only in lower case, unlike "the E Street Band". */
const NAME_JOINT = /\s*,\s*|\s+(?:&|\+|and|And|AND)\s+|\s+e\s+/;

/**
 * An artist phrase also leaves out every credit and joining word, wherever
 * it is, so "Simon and Garfunkel" reads as "Simon & Garfunkel" and "Sandy e
 * Junior" as "Sandy & Junior". Guesses at the artist are read the same way.
 */
export function artistPhrase(raw: string): Phrase {
  const words = phrase(markActs(raw)).words.filter((w) => !JOINERS.has(w));
  return { words, text: words.join("") };
}

/** Builds the lexicon from every song list, each judged on its own so a small list keeps its own common words. */
export function buildLexicon(
  lists: readonly (readonly { title: string; artist: string }[])[],
): Lexicon {
  const common = new Set<string>();
  const acts = new Set<string>();
  for (const songs of lists) {
    const counts = new Map<string, number>();
    for (const { title, artist } of songs) {
      for (const word of new Set(phrase(title).words))
        counts.set(word, (counts.get(word) ?? 0) + 1);
      for (const act of actsOf(artist)) acts.add(artistPhrase(act).text);
    }
    for (const [word, count] of counts)
      if (count >= Math.max(3, songs.length * COMMON_SHARE)) common.add(word);
  }
  return { common, acts };
}

/** Says something on its own: three words or more, or one word that is not common in titles. */
const distinctive = (p: Phrase, lexicon: Lexicon) =>
  p.words.length >= 3 || p.words.some((w) => !lexicon.common.has(w));

function forms(phrases: Phrase[], lexicon: Lexicon): AnswerForm[] {
  const seen = new Set<string>();
  const out: AnswerForm[] = [];
  for (const p of phrases) {
    if (!p.text || seen.has(p.text)) continue;
    seen.add(p.text);
    out.push({ ...p, distinctive: distinctive(p, lexicon) });
  }
  return out;
}

/**
 * Every accepted way to write a song's title and artist.
 *
 * Title: each side of a double A-side ("Bird Dog" / "Devoted to You"),
 * with its bracketed part dropped or kept ("Sin" or "It's No Sin").
 *
 * Artist: the whole credit, each act around "feat.", "with" and the like
 * (see markActs), and any names around "&", "and", "e" and commas that are
 * credited on their own somewhere in the song lists or are at least two
 * words long. So "Luis Fonsi and Daddy Yankee" accepts "Luis Fonsi" and
 * "Jorge & Mateus e Lauana Prado" accepts "Jorge & Mateus", but "Earth,
 * Wind & Fire" does not accept "Fire", nor "Mumford & Sons" "Sons".
 */
export function answersFor(
  song: { title: string; artist: string },
  lexicon: Lexicon,
): Answers {
  const sides = song.title.split(/\s*"\s*\/\s*"\s*|\s+\/\s+/);
  const titles = sides.flatMap((side) => [
    phrase(side),
    phrase(side.replace(/[()[\]]/g, " ")),
  ]);
  const artists = [artistPhrase(song.artist)];
  for (const act of actsOf(song.artist)) {
    artists.push(artistPhrase(act));
    // Every run of names, since a duo can be one name among others.
    const names = act.split(new RegExp(NAME_JOINT.source, "g"));
    for (let i = 0; i < names.length; i++)
      for (let j = i + 1; j <= names.length; j++) {
        const run = artistPhrase(names.slice(i, j).join(" & "));
        if (run.words.length >= 2 || lexicon.acts.has(run.text))
          artists.push(run);
      }
  }
  return { title: forms(titles, lexicon), artist: forms(artists, lexicon) };
}

/**
 * Optimal string alignment distance: insertions, deletions, substitutions
 * and swaps of neighbours each cost one. Gives up past `max`, returning max + 1.
 */
export function distance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(
        previous[j]! + 1,
        row[j - 1]! + 1,
        previous[j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d = Math.min(d, before[j - 2]! + 1);
      row.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return max + 1;
    before = previous;
    previous = row;
  }
  return Math.min(previous[b.length]!, max + 1);
}

/** Whether `inner` appears as a run of whole words in `outer`. */
function within(inner: string[], outer: string[]): boolean {
  for (let i = 0; i + inner.length <= outer.length; i++)
    if (inner.every((w, j) => outer[i + j] === w)) return true;
  return false;
}

/**
 * The answer exactly, or with one typo when it is long enough that one slip
 * cannot make it another plausible answer ("bohemian rapsody").
 */
function matches(guess: Phrase, form: AnswerForm): boolean {
  if (!guess.text) return false;
  if (guess.text === form.text) return true;
  return (
    form.text.length >= TYPO_MIN_LENGTH &&
    distance(guess.text, form.text, 1) <= 1
  );
}

/**
 * Close to the answer without matching it. Following the design prototype:
 * - a few typos off: one for an answer of 4 to 7 letters, two from 8. The
 *   guess needs 4 letters, so "lol" is not close to "Lola".
 * - part of the answer, in whole words, holding at least half its letters
 *   and at least 4, and saying something on its own (see distinctive):
 *   "bohemian" is close to "Bohemian Rhapsody" and "need is love" to "All
 *   You Need Is Love", but "love", "you" or "you need" is not.
 * - the answer, in whole words, inside a longer line ("is this Queen??"),
 *   unless every word of the answer is common, so "I love this" is just
 *   chat while "Love" plays.
 */
function near(guess: Phrase, form: AnswerForm, lexicon: Lexicon): boolean {
  const [g, a] = [guess.text, form.text];
  if (g.length >= 4 && a.length >= 4) {
    const max = a.length >= TYPO_MIN_LENGTH ? 2 : 1;
    if (distance(g, a, max) <= max) return true;
  }
  if (
    g.length >= 4 &&
    g.length * 2 >= a.length &&
    distinctive(guess, lexicon) &&
    within(guess.words, form.words)
  )
    return true;
  return (
    form.distinctive &&
    guess.words.length > form.words.length &&
    within(form.words, guess.words)
  );
}

const PARTS: Part[] = ["title", "artist"];

/** Lines like "Bohemian Rhapsody by Queen" or "Queen - Bohemian Rhapsody", split at each such joint. */
const JOINT = /\s+(?:by|por|de|-|–|—|\/)\s+|\s*[,:]\s+/gi;

/**
 * Judges one chat line against the song's answers, given which parts the
 * player already has. A line naming the title, the artist, or both (in
 * one line, joined by "by", "-" or a comma) credits the parts that are new.
 * A line that is near a part (see near) is a near miss, or a repeat if the
 * player already has that part, so a player who has it cannot spoil it
 * for the others with a typo either.
 */
export function judgeGuess(
  text: string,
  answers: Answers,
  had: Record<Part, boolean>,
  lexicon: Lexicon,
): Verdict {
  const guess = { title: phrase(text), artist: artistPhrase(text) };
  const named = (raw: string, part: Part, strict: boolean) => {
    const g = part === "title" ? phrase(raw) : artistPhrase(raw);
    return answers[part].some(
      (form) => matches(g, form) && (!strict || form.distinctive),
    );
  };

  let found = PARTS.filter((part) => named(text, part, false));
  if (!found.length) {
    // A half naming a part alone must be distinctive, so "Stand by Me" never credits a song called "Me".
    const halves = new Set<Part>();
    for (const joint of text.matchAll(JOINT)) {
      const left = text.slice(0, joint.index);
      const right = text.slice(joint.index + joint[0].length);
      const pair =
        (named(left, "title", false) && named(right, "artist", false)) ||
        (named(left, "artist", false) && named(right, "title", false));
      for (const part of PARTS)
        if (pair || named(left, part, true) || named(right, part, true))
          halves.add(part);
    }
    found = PARTS.filter((part) => halves.has(part));
  }
  if (found.length) {
    const fresh = found.filter((part) => !had[part]);
    return fresh.length
      ? { kind: "credit", parts: fresh }
      : { kind: "repeat", part: found[0]! };
  }

  const close = PARTS.filter((part) =>
    answers[part].some((form) => near(guess[part], form, lexicon)),
  );
  if (!close.length) return null;
  return close.some((part) => !had[part])
    ? { kind: "near" }
    : { kind: "repeat", part: close[0]! };
}
