import { describe, expect, it } from "vitest";
import { SONG_LISTS, type Song, type SongListId } from "../src";
import {
  answersFor,
  artistPhrase,
  buildLexicon,
  distance,
  judgeGuess,
  phrase,
  type Part,
} from "../src/hitster/guess";

const lexicon = buildLexicon(Object.values(SONG_LISTS));
const none = { title: false, artist: false };

/** A real song from the lists, so the tests follow the data the game plays. */
function song(list: SongListId, title: string, artist: string): Song {
  const found = SONG_LISTS[list].find(
    (s) => s.title === title && s.artist === artist,
  );
  if (!found) throw new Error(`${title} by ${artist} is not in ${list}`);
  return found;
}
const answers = (s: Song) => answersFor(s, lexicon);
const judge = (s: Song, text: string, had = none) =>
  judgeGuess(text, answers(s), had, lexicon);
const credits = (s: Song, text: string): Part[] => {
  const verdict = judge(s, text);
  return verdict?.kind === "credit" ? verdict.parts : [];
};

const rhapsody = song("international", "Bohemian Rhapsody", "Queen");
const loveBeatles = song(
  "international",
  "All You Need Is Love",
  "The Beatles",
);

describe("phrase", () => {
  it("ignores case, accents, punctuation and a leading article", () => {
    expect(phrase("Águas de Março").text).toBe("aguasdemarco");
    expect(phrase("AGUAS DE MARCO!!").text).toBe("aguasdemarco");
    expect(phrase("The Beatles").text).toBe("beatles");
    expect(phrase("O Tic-Tac do Meu Coração").words).toEqual([
      "tictac",
      "do",
      "meu",
      "coracao",
    ]);
    expect(phrase("Don't Stop Me Now").text).toBe("dontstopmenow");
    expect(phrase("Don’t stop me now").text).toBe("dontstopmenow");
  });

  it('reads "&" as "and" and drops bracketed parts and a "feat." tail', () => {
    expect(phrase("Rock & Roll").text).toBe(phrase("rock and roll").text);
    expect(phrase("Yesterday (Remastered 2011)").text).toBe("yesterday");
    expect(phrase("Yesterday [Live]").text).toBe("yesterday");
    expect(phrase("Despacito feat. Justin Bieber").text).toBe("despacito");
    expect(phrase("Despacito ft. Justin Bieber").text).toBe("despacito");
    expect(phrase("Despacito featuring Justin Bieber").text).toBe("despacito");
    expect(phrase("Shake Ya Tailfeather").text).toBe("shakeyatailfeather");
  });

  it("keeps a lone article and words from other scripts", () => {
    expect(phrase("The").text).toBe("the");
    expect(phrase("A").text).toBe("a");
    expect(phrase("MØ").text).toBe("mø");
  });
});

describe("artistPhrase", () => {
  it("reads every way of joining names the same", () => {
    const sandy = artistPhrase("Sandy & Junior").text;
    for (const typed of ["Sandy e Junior", "sandy and junior", "Sandy+Junior"])
      expect(artistPhrase(typed.replace("+", " + ")).text).toBe(sandy);
    expect(artistPhrase("Simon and Garfunkel").text).toBe(
      artistPhrase("Simon & Garfunkel").text,
    );
    expect(artistPhrase("Earth Wind and Fire").text).toBe(
      artistPhrase("Earth, Wind & Fire").text,
    );
    expect(artistPhrase("a-ha").text).toBe("aha");
  });
});

describe("distance", () => {
  it("counts edits, with a swap of neighbours as one, and gives up past the limit", () => {
    expect(distance("queen", "queen", 2)).toBe(0);
    expect(distance("queen", "quen", 2)).toBe(1);
    expect(distance("bohemian", "bohemain", 2)).toBe(1);
    expect(distance("kitten", "sitting", 5)).toBe(3);
    expect(distance("kitten", "sitting", 1)).toBe(2);
    expect(distance("a", "abcdef", 2)).toBe(3);
    expect(distance("", "", 0)).toBe(0);
  });
});

describe("the lexicon", () => {
  it("knows the words common in each list's titles, and not rarer ones", () => {
    for (const word of ["love", "you", "the", "baby", "amor", "coracao"])
      expect(lexicon.common.has(word)).toBe(true);
    for (const word of ["queen", "toto", "rhapsody", "ipanema", "garota"])
      expect(lexicon.common.has(word)).toBe(false);
  });
});

describe("answersFor", () => {
  it("accepts a title with or without its bracketed part, and either side of a double A-side", () => {
    const sin = song("international", "(It's No) Sin", "Eddy Howard");
    expect(answers(sin).title.map((f) => f.text)).toEqual(["sin", "itsnosin"]);
    const birdDog = song(
      "international",
      'Bird Dog" / "Devoted to You',
      "The Everly Brothers",
    );
    expect(credits(birdDog, "Bird Dog")).toEqual(["title"]);
    expect(credits(birdDog, "devoted to you")).toEqual(["title"]);
    const despacito = song(
      "international",
      "Despacito (Remix)",
      "Luis Fonsi and Daddy Yankee featuring Justin Bieber",
    );
    expect(credits(despacito, "despacito")).toEqual(["title"]);
    expect(credits(despacito, "Despacito remix")).toEqual(["title"]);
  });

  it("accepts any credited act, and names around & or e only when they are credited alone somewhere", () => {
    const despacito = song(
      "international",
      "Despacito (Remix)",
      "Luis Fonsi and Daddy Yankee featuring Justin Bieber",
    );
    for (const typed of [
      "Justin Bieber",
      "Daddy Yankee",
      "Luis Fonsi",
      "Luis Fonsi & Daddy Yankee",
    ])
      expect(credits(despacito, typed)).toEqual(["artist"]);

    const shining = song("international", "Shining Star", "Earth, Wind & Fire");
    expect(credits(shining, "Earth, Wind & Fire")).toEqual(["artist"]);
    expect(credits(shining, "earth wind and fire")).toEqual(["artist"]);
    expect(credits(shining, "fire")).toEqual([]);
    const mumford = song("international", "I Will Wait", "Mumford & Sons");
    expect(credits(mumford, "sons")).toEqual([]);
    expect(credits(mumford, "Mumford and Sons")).toEqual(["artist"]);
  });

  it("splits Brazilian credits: e, com participação de, part., and duos inside them", () => {
    const linda = song("brasil", "Linda Morena", "Mário Reis e Lamartine Babo");
    expect(credits(linda, "mario reis")).toEqual(["artist"]);
    expect(credits(linda, "Lamartine Babo")).toEqual(["artist"]);
    const tudo = song(
      "brasil",
      "Tudo Indica",
      "Marcos & Belutti (com participação de Jorge & Mateus)",
    );
    expect(credits(tudo, "Jorge e Mateus")).toEqual(["artist"]);
    expect(credits(tudo, "marcos e belutti")).toEqual(["artist"]);
    const sinais = song(
      "brasil",
      "Haverá Sinais",
      "Jorge & Mateus e Lauana Prado",
    );
    expect(credits(sinais, "jorge & mateus")).toEqual(["artist"]);
    expect(credits(sinais, "Lauana Prado")).toEqual(["artist"]);
    const aquele = song(
      "brasil",
      "Aquele 1%",
      "Marcos & Belutti part. Wesley Safadão",
    );
    expect(credits(aquele, "wesley safadao")).toEqual(["artist"]);
    expect(credits(aquele, "aquele 1")).toEqual(["title"]);
  });
});

describe("judgeGuess", () => {
  it("credits the exact title or artist, however it is written", () => {
    expect(credits(rhapsody, "bohemian rhapsody")).toEqual(["title"]);
    expect(credits(rhapsody, "  BOHEMIAN RHAPSODY!  ")).toEqual(["title"]);
    expect(credits(rhapsody, "queen")).toEqual(["artist"]);
    expect(credits(loveBeatles, "beatles")).toEqual(["artist"]);
    expect(credits(loveBeatles, "The Beatles")).toEqual(["artist"]);
  });

  it("credits accented Brazilian titles and artists typed without accents", () => {
    const aguas = song("brasil", "Águas de Março", "Elis Regina e Tom Jobim");
    expect(credits(aguas, "aguas de marco")).toEqual(["title"]);
    expect(credits(aguas, "Águas de Março")).toEqual(["title"]);
    expect(credits(aguas, "tom jobim")).toEqual(["artist"]);
    expect(credits(aguas, "Elis Regina")).toEqual(["artist"]);
    const tic = song("brasil", "O Tic-Tac do Meu Coração", "Carmen Miranda");
    expect(credits(tic, "tic tac do meu coracao")).toEqual(["title"]);
    expect(credits(tic, "o tictac do meu coração")).toEqual(["title"]);
    const ivete = song(
      "brasil",
      "Se Eu Não Te Amasse Tanto Assim",
      "Ivete Sangalo",
    );
    expect(credits(ivete, "se eu nao te amasse tanto assim")).toEqual([
      "title",
    ]);
  });

  it("forgives one typo in an answer of 8 letters or more, and none in a shorter one", () => {
    expect(credits(rhapsody, "bohemian rapsody")).toEqual(["title"]);
    expect(credits(rhapsody, "bohemain rhapsody")).toEqual(["title"]);
    expect(judge(rhapsody, "bohemian rapsodi")).toEqual({ kind: "near" });
    expect(credits(rhapsody, "quen")).toEqual([]);
    expect(judge(rhapsody, "quen")).toEqual({ kind: "near" });
    const ipanema = song("brasil", "Garota de Ipanema", "Pery Ribeiro");
    expect(credits(ipanema, "garota de ipanena")).toEqual(["title"]);
    expect(credits(ipanema, "pery ribero")).toEqual(["artist"]);
  });

  it("credits both parts named in one line, in either order", () => {
    for (const typed of [
      "Bohemian Rhapsody by Queen",
      "queen - bohemian rhapsody",
      "Bohemian Rhapsody, Queen",
    ])
      expect(credits(rhapsody, typed)).toEqual(["title", "artist"]);
    const ipanema = song("brasil", "Garota de Ipanema", "Pery Ribeiro");
    expect(credits(ipanema, "Garota de Ipanema de Pery Ribeiro")).toEqual([
      "title",
      "artist",
    ]);
    // One distinctive half is enough; the other half is just chat.
    expect(credits(rhapsody, "bohemian rhapsody - what a classic")).toEqual([
      "title",
    ]);
  });

  it("credits a self-titled song's title and artist at once", () => {
    const self = { title: "Bad Company", artist: "Bad Company" } as Song;
    expect(credits(self, "bad company")).toEqual(["title", "artist"]);
  });

  it("only credits parts the player does not have yet, and reports a repeat otherwise", () => {
    const hadTitle = { title: true, artist: false };
    expect(judge(rhapsody, "bohemian rhapsody", hadTitle)).toEqual({
      kind: "repeat",
      part: "title",
    });
    expect(judge(rhapsody, "Bohemian Rhapsody by Queen", hadTitle)).toEqual({
      kind: "credit",
      parts: ["artist"],
    });
    expect(judge(rhapsody, "queen", { title: true, artist: true })).toEqual({
      kind: "repeat",
      part: "artist",
    });
  });

  it("calls a guess near when it is a typo or two off, or more than half the answer", () => {
    expect(judge(rhapsody, "bohemian")).toEqual({ kind: "near" });
    expect(judge(rhapsody, "rhapsody")).toEqual({ kind: "near" });
    expect(judge(loveBeatles, "all you need")).toEqual({ kind: "near" });
    expect(judge(loveBeatles, "need is love")).toEqual({ kind: "near" });
    expect(judge(loveBeatles, "all you need is lov")).toEqual({
      kind: "credit",
      parts: ["title"],
    });
    expect(judge(loveBeatles, "beatle")).toEqual({ kind: "near" });
  });

  it("allows more typos in a near miss the longer the answer, so a few slips cannot spoil it", () => {
    const susie = song(
      "international",
      "Wake Up Little Susie",
      "The Everly Brothers",
    );
    // 3 edits off 17 letters.
    expect(judge(susie, "Wake Up Little Suzy")).toEqual({ kind: "near" });
    expect(judge(susie, "wake up lil susie")).toEqual({ kind: "near" });
    expect(judge(rhapsody, "bohemain rapsodi")).toEqual({ kind: "near" });
    const hand = song(
      "international",
      "I Want to Hold Your Hand",
      "The Beatles",
    );
    expect(judge(hand, "i wanna hold your hand")).toEqual({ kind: "near" });
    const hotel = song("international", "Hotel California", "Eagles");
    expect(judge(hotel, "hotell califonia")).toEqual({ kind: "near" });
    // Credit is unchanged: still one typo at most.
    expect(credits(susie, "Wake Up Little Suzy")).toEqual([]);
    expect(credits(hotel, "hotel californa")).toEqual(["title"]);
  });

  it("calls the start of the answer near when its last word is cut short", () => {
    const slow = song("international", "Slow Motion", "Color Me Badd");
    expect(judge(slow, "slow mo")).toEqual({ kind: "near" });
    expect(judge(rhapsody, "bohemian rhap")).toEqual({ kind: "near" });
    expect(judge(loveBeatles, "all you nee")).toEqual({ kind: "near" });
    const ipanema = song("brasil", "Garota de Ipanema", "Pery Ribeiro");
    expect(judge(ipanema, "garota de ipa")).toEqual({ kind: "near" });
    const believin = song("international", "Don't Stop Believin'", "Journey");
    expect(judge(believin, "dont stop beli")).toEqual({ kind: "near" });
    // Not when the words it stands for are all common, or the line is too little of the answer.
    expect(judge(loveBeatles, "you need lo")).toBeNull();
    expect(judge(rhapsody, "bohemian r")).toBeNull();
    expect(judge(slow, "slow")).toBeNull();
    // A lone cut word is too often chat: "classic" while Classics IV plays.
    const spooky = song("international", "Spooky", "Classics IV");
    expect(judge(spooky, "classic")).toBeNull();
  });

  it("calls a guess near when it leaves out one word of the answer", () => {
    const susie = song(
      "international",
      "Wake Up Little Susie",
      "The Everly Brothers",
    );
    expect(judge(susie, "wake up susie")).toEqual({ kind: "near" });
    expect(judge(loveBeatles, "all need is love")).toEqual({ kind: "near" });
    // Unless every word left is common.
    const always = song(
      "international",
      "I Will Always Love You",
      "Whitney Houston",
    );
    expect(judge(always, "i will love you")).toBeNull();
  });

  it("judges accented and unaccented Portuguese near misses alike", () => {
    const aguas = song("brasil", "Águas de Março", "Elis Regina e Tom Jobim");
    expect(judge(aguas, "agua de marso")).toEqual({ kind: "near" });
    expect(judge(aguas, "água de marso")).toEqual({ kind: "near" });
    const ivete = song(
      "brasil",
      "Se Eu Não Te Amasse Tanto Assim",
      "Ivete Sangalo",
    );
    expect(judge(ivete, "se eu nao te amase tanto asim")).toEqual({
      kind: "near",
    });
    expect(judge(ivete, "se eu não te amase tanto asim")).toEqual({
      kind: "near",
    });
    for (const typed of ["eu te amo", "eu nao sei", "não te amo tanto"])
      expect(judge(ivete, typed)).toBeNull();
  });

  it("calls a line holding the whole answer near, so it cannot spoil it", () => {
    const toto = song("international", "Hold the Line", "Toto");
    expect(judge(toto, "Toto. final answer")).toEqual({ kind: "near" });
    expect(judge(rhapsody, "is this Queen??")).toEqual({ kind: "near" });
    expect(judge(loveBeatles, "pretty sure it's all you need is love")).toEqual(
      { kind: "near" },
    );
  });

  it("lets common words through as chat", () => {
    for (const typed of [
      "love",
      "the",
      "you",
      "I love this song",
      "lol",
      "omg",
      "you need",
    ])
      expect(judge(loveBeatles, typed)).toBeNull();
    const love = song("international", "Love", "Musiq Soulchild");
    expect(credits(love, "love")).toEqual(["title"]);
    expect(judge(love, "I love this one")).toBeNull();
    const coracao = song("brasil", "Coração", "Carmen Miranda");
    expect(credits(coracao, "coracao")).toEqual(["title"]);
    expect(judge(coracao, "meu coração bate forte")).toBeNull();
    const tender = song("international", "Love Me Tender", "Elvis Presley");
    expect(judge(tender, "love me")).toBeNull();
    expect(judge(tender, "love me tndr")).toEqual({ kind: "near" });
    // Whole words only: "adelaide" does not hold "Adele".
    const hello = song("international", "Hello", "Adele");
    expect(judge(hello, "an unrelated line about adelaide")).toBeNull();
  });

  it("is not fooled into crediting a short common answer from half a line", () => {
    const love = song("international", "Love", "Musiq Soulchild");
    expect(credits(love, "I need some love - right now")).toEqual([]);
  });

  it("keeps a player who has a part from spoiling it with a typo", () => {
    expect(
      judge(rhapsody, "bohemian rapsodi", { title: true, artist: false }),
    ).toEqual({
      kind: "repeat",
      part: "title",
    });
    expect(
      judge(rhapsody, "is this queen", { title: false, artist: true }),
    ).toEqual({
      kind: "repeat",
      part: "artist",
    });
  });

  it("leaves ordinary chat alone", () => {
    for (const typed of [
      "my dad plays this in the car",
      "ok this is definitely 80s",
      "wait wait wait dont tell me",
      "",
      "!!!",
    ])
      expect(judge(rhapsody, typed)).toBeNull();
  });

  it("leaves ordinary chat alone against long titles too", () => {
    const long = [
      song("international", "Wake Up Little Susie", "The Everly Brothers"),
      song("international", "I Will Always Love You", "Whitney Houston"),
      song("international", "Smells Like Teen Spirit", "Nirvana"),
      song("brasil", "Se Eu Não Te Amasse Tanto Assim", "Ivete Sangalo"),
    ];
    for (const s of long)
      for (const typed of [
        "i know this one",
        "no idea",
        "i love you",
        "i love this song",
        "wait wait wait dont tell me",
        "it's on the tip of my tongue",
        "you know",
        "que música boa",
        "sei essa",
        "não faço ideia",
        "eu te amo",
        "kkkkkk",
      ])
        expect(judge(s, typed)).toBeNull();
  });
});
