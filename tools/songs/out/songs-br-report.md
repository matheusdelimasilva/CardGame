# Brazilian song dataset build report

Snapshot: 2026-11-14. Branch: songs-brazil. This historical report predates the 2026-11-15 sparse-year additions; see [verification notes](../brazil/verification-br.md) for those additions and current counts in songs-br.json.

**1663 songs; 1290 Deezer IDs (77.6%).**

## Pipeline completion

| Step | Status | Evidence |
| --- | --- | --- |
| Wikipedia | Full | 40 chart pages; categories 1900–2026 (127/127 years); one connection reset resumed from cache. |
| MusicBrainz | Partial | 700/1663 current unique source keys cached; 712 total cached keys (including superseded credits). |
| Build | Full | 1663 rows; rebuilt after matching. |
| Deezer | Full | 1663/1663 current rows attempted; 1290 matched, 373 misses, 0 unqueried. |
| Validation | Full | JSON array, nonempty titles/artists, integer years, positive integer/null Deezer IDs, no normalised title+artist duplicates. 66 Vitest tests, 3 offline pipeline tests, server typecheck. |

Requests kept the existing intervals: Wikipedia 1.5 s, MusicBrainz 1.1 s, Deezer 120 ms, with a generic User-Agent. Raw caches stay gitignored and are not committed.

## Counts per decade

| Value | Songs |
| --- | --- |
| 1910s | 4 |
| 1920s | 4 |
| 1930s | 38 |
| 1940s | 25 |
| 1950s | 19 |
| 1960s | 41 |
| 1970s | 95 |
| 1980s | 114 |
| 1990s | 175 |
| 2000s | 352 |
| 2010s | 413 |
| 2020s | 383 |

## Counts per yearSource

| Value | Songs |
| --- | --- |
| chart-year | 126 |
| curated | 98 |
| musicbrainz | 479 |
| wikipedia | 960 |

## Counts per source

| Value | Songs |
| --- | --- |
| Brasil Hot 100 | 34 |
| Brasil Hot 100 Airplay | 104 |
| Brasil Hot Popular Songs | 7 |
| Brazil Songs | 6 |
| Crowley year-end | 430 |
| curated | 66 |
| press:buscape | 7 |
| press:crowley | 2 |
| press:pro-musica | 1 |
| press:spotify | 1 |
| Top 10 Pop Nacional | 8 |
| Top 100 Brasil | 41 |
| Top 50 Streaming | 37 |
| wikipedia-category | 919 |

## Fifteen sample rows across decades

| Year | Title | Artist | yearSource | source | chartYear | chartRank | deezerId |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1912 | Odeon | Pedro de Alcântara e Ernesto Nazareth | wikipedia | wikipedia-category | — | — | — |
| 1920 | O Pé de Anjo | Francisco Alves | curated | curated | — | — | — |
| 1930 | Pra Você Gostar de Mim (Taí) | Carmen Miranda | curated | curated | — | — | 1588616622 |
| 1940 | Aurora | Joel e Gaúcho | curated | curated | — | — | — |
| 1950 | Baião Ca-Room' Pa Pa | Carmen Miranda | wikipedia | wikipedia-category | — | — | — |
| 1950 | Qui Nem Jiló | Luiz Gonzaga | curated | curated | — | — | 3877247311 |
| 1960 | Banho de Lua | Celly Campello | curated | curated | — | — | 2775647931 |
| 1970 | Azul da Cor do Mar | Tim Maia | wikipedia | wikipedia-category | — | — | 543138072 |
| 1980 | 1, 2, 3 (One-Two-Three) | Gretchen | wikipedia | wikipedia-category | — | — | 689422252 |
| 1988 | Ainda Ontem Chorei de Saudade | João Mineiro & Marciano | wikipedia | wikipedia-category | — | — | 3508136 |
| 1990 | Abre las Ventanas al Amor | Roberto Carlos | wikipedia | wikipedia-category | — | — | — |
| 2000 | A Dor Desse Amor | KLB | musicbrainz | Crowley year-end | 2000 | 2 | 1006222812 |
| 2010 | Adrenalina | Luan Santana | wikipedia | Brasil Hot 100 Airplay | 2010 | 1 | 3713876592 |
| 2020 | A Vida é Um Rio | Raffa Torres | chart-year | Top 100 Brasil | 2020 | 1 | 1948748587 |
| 2026 | Um Pouco de Mim | Luísa Sonza e Roberto Menescal | wikipedia | wikipedia-category | — | — | 3871956551 |

Full rows, including mbid, are in songs-br.json.

## Quality and unresolved work

- International entries are retained: at least 113 rows from a known international-act check (not an exhaustive nationality census). This dataset represents Brazilian chart history plus Brazilian categories/curation, rather than Brazilian artists exclusively. International entries from categories may be mixed-cover articles and need review; examples include Matsuken Samba II, Algo tienes, and We Don’t Talk About Bruno.
- 103 category rows without a specific performer were excluded; see the list below. Portuguese-language-only category evidence and two articles mixing foreign originals with Brazilian covers were also excluded.
- 0 rows contain residual markup or unbalanced quotation marks and are flagged for review. Chão de Giz's stray final apostrophe was corrected.
- 0 Deezer IDs are shared by multiple surviving credits; those rows need recording-level review, especially guest/remix credits.
- 0 discovered chart pages yielded zero parsed rows; they remain potential source/parser coverage gaps.
- 100 rows in curated-br.mjs have not been independently verified in this run. Touradas em Madri has a verified performer but an unverified release year.
- Category years can be composition years and infobox performers can be later cover artists. Specific verified conflicts were fixed; the remaining category catalog is not fully audited. Category input also includes album tracks and multi-part works such as História de Pescadores, rather than chart hits only.
- MusicBrainz candidates are accepted only near the supplied year; chart-year fallbacks may be wrong, especially catalog songs that returned to the charts. Even a MusicBrainz year can describe a reissue.
- Deezer title/artist matching does not prove recording identity or first-release date. Untagged studio re-recordings and guest versions remain a limitation. Odeon (1912 recording versus possible 1913 release) and the combined Elizeth Cardoso / João Gilberto Chega de Saudade credit still need review.

Verified performer/year changes and individual live-hit decisions: [verification-br.md](../brazil/verification-br.md).

### International entries flagged

| Year | Title | Artist | Source |
| --- | --- | --- | --- |
| 1988 | Baby Can I Hold You | Tracy Chapman | wikipedia-category |
| 1992 | El Arbi | Cheb Khaled | wikipedia-category |
| 1996 | They Don't Care About Us | Michael Jackson | wikipedia-category |
| 1997 | Corazón Partío | Alejandro Sanz | Crowley year-end |
| 1997 | Immortality | Céline Dion (participação de Bee Gees) | Crowley year-end |
| 1997 | To Love You More | Céline Dion | Crowley year-end |
| 1997 | Sailing | 'N Sync | Crowley year-end |
| 1998 | Dois Amigos | Julio Iglesias | Crowley year-end |
| 1999 | I Want It That Way | Backstreet Boys | Crowley year-end |
| 1999 | Back at One | Brian McKnight (com participação de Ivete Sangalo) | Crowley year-end |
| 1999 | You'll Be in My Heart | Phil Collins | Crowley year-end |
| 1999 | She's All I Ever Had | Ricky Martin | Crowley year-end |
| 1999 | Mambo No. 5 (A Little Bit of...) | Lou Bega | Crowley year-end |
| 2002 | All for Love | Michael Bolton | Crowley year-end |
| 2004 | Algo tienes | Paulina Rubio | wikipedia-category |
| 2004 | Matsuken Samba II | Ken Matsudaira | wikipedia-category |
| 2005 | Don't Matter | Akon | Crowley year-end |
| 2005 | Home | Michael Bublé | Crowley year-end |
| 2005 | Lonely | Akon | Crowley year-end |
| 2005 | Candy Shop | 50 Cent | Crowley year-end |
| 2005 | Buttons | The Pussycat Dolls (participação de Snoop Dogg) | Crowley year-end |
| 2005 | Say Goodbye | Chris Brown | Crowley year-end |
| 2005 | Run It! | Chris Brown com a participação de Juelz Santana | wikipedia-category |
| 2006 | Big Girls Don't Cry | Fergie | Crowley year-end |
| 2006 | Too Little Too Late | JoJo | Crowley year-end |
| 2006 | Irreplaceable | Beyoncé | Crowley year-end |
| 2006 | Say It Right | Nelly Furtado | Crowley year-end |
| 2006 | Open Your Eyes | Snow Patrol | Crowley year-end |
| 2006 | What Goes Around... Comes Around | Justin Timberlake | Crowley year-end |
| 2006 | Clumsy | Fergie | Crowley year-end |
| 2006 | Smack That | Akon ft. Eminem | Crowley year-end |
| 2006 | My Love | Justin Timberlake | Crowley year-end |
| 2006 | Say OK | Vanessa Hudgens | Crowley year-end |
| 2006 | Fergalicious | Fergie | Crowley year-end |
| 2006 | You Give Me Something | James Morrison | Crowley year-end |
| 2006 | I Wanna Love You | Akon (participação de Snoop Dogg) | Crowley year-end |
| 2006 | Summer Love | Justin Timberlake | Crowley year-end |
| 2006 | Come Back to Me | Vanessa Hudgens | Crowley year-end |
| 2006 | Promiscuous | Nelly Furtado (participação de Timbaland) | Crowley year-end |
| 2006 | Tu Amor | RBD | Crowley year-end |
| 2006 | Sexy Love | Ne-Yo | Crowley year-end |
| 2006 | Sorry, Blame It on Me | Akon | Crowley year-end |
| 2006 | Lovely | Tommy Vee vs. Andrea T. Mendoza | Crowley year-end |
| 2006 | I Wish U Would | Martijn Ten Velden | Crowley year-end |
| 2006 | Destination Calabria | Alex Gaudino | Crowley year-end |
| 2006 | Hips Don't Lie | Shakira (participação de Wyclef Jean) | Crowley year-end |
| 2006 | Call on Me | Janet Jackson (participação de Nelly) | Crowley year-end |
| 2006 | Do It to It | Cherish | Crowley year-end |
| 2007 | Don't Stop the Music | Rihanna | Crowley year-end |
| 2007 | No One | Alicia Keys | Crowley year-end |
| 2007 | Same Mistake | James Blunt | Crowley year-end |
| 2007 | With You | Chris Brown | Crowley year-end |
| 2007 | Kiss Kiss | Chris Brown (participação de T-Pain) | Crowley year-end |
| 2007 | Beautiful Liar | Beyoncé & Shakira | Crowley year-end |
| 2007 | Umbrella | Rihanna (participação de Jay-Z) | Crowley year-end |
| 2007 | Apologize | Timbaland (participação de OneRepublic) | Crowley year-end |
| 2007 | Beautiful Girls | Sean Kingston | Crowley year-end |
| 2007 | Last Night | Diddy (participação de Keyshia Cole) | Crowley year-end |
| 2007 | Para Tu Amor | Juanes | Crowley year-end |
| 2007 | Give It to Me | Timbaland (participação de Nelly Furtado e Justin Timberlake) | Crowley year-end |
| 2007 | Girlfriend | Avril Lavigne | Crowley year-end |
| 2007 | Piece of Me | Britney Spears | Crowley year-end |
| 2007 | Because of You | Ne-Yo | Crowley year-end |
| 2007 | Bubbly | Colbie Caillat | Crowley year-end |
| 2007 | When You Look Me in the Eyes | Jonas Brothers | Crowley year-end |
| 2007 | Be Good to Me | Ashley Tisdale | Crowley year-end |
| 2007 | Rise Up | Yves Larock | Crowley year-end |
| 2007 | Love Is Gone | David Guetta | Crowley year-end |
| 2007 | Ayo Technology | 50 Cent (participação de Justin Timberlake) | Crowley year-end |
| 2007 | Bleeding Love | Leona Lewis | Crowley year-end |
| 2007 | Killa | Cherish (participação de Yung Joc) | Crowley year-end |
| 2007 | When You're Gone | Avril Lavigne | Crowley year-end |
| 2007 | Sensual Seduction | Snoop Dogg | Crowley year-end |
| 2007 | The Way I Are | Timbaland (participação de Keri Hilson e D.O.E.) | Crowley year-end |
| 2007 | Wall to Wall | Chris Brown | Crowley year-end |
| 2007 | What I've Done | Linkin Park | Crowley year-end |
| 2008 | Halo | Beyoncé | Brasil Hot 100 Airplay |
| 2008 | Touch My Body | Mariah Carey | Crowley year-end |
| 2008 | 4 Minutes | Madonna (participação de Justin Timberlake) | Crowley year-end |
| 2008 | Take a Bow | Rihanna | Crowley year-end |
| 2008 | Hate That I Love You | Rihanna (participação de Ne-Yo) | Crowley year-end |
| 2008 | No Air | Jordin Sparks (participação de Chris Brown) | Crowley year-end |
| 2008 | Low | Flo Rida (participação de T-Pain) | Crowley year-end |
| 2008 | Love in This Club | Usher (participação de Young Jeezy) | Crowley year-end |
| 2008 | Give It 2 Me | Madonna | Crowley year-end |
| 2008 | Forever | Chris Brown | Crowley year-end |
| 2008 | Bye Bye | Mariah Carey | Crowley year-end |
| 2008 | Disturbia | Rihanna | Crowley year-end |
| 2008 | Closer | Ne-Yo | Crowley year-end |
| 2008 | Your Love Is a Lie | Simple Plan | Crowley year-end |
| 2008 | Break the Ice | Britney Spears | Crowley year-end |
| 2008 | Keep on Rising | Ian Carey | Crowley year-end |
| 2008 | Viva la Vida | Coldplay | Crowley year-end |
| 2008 | Dangerous (Remix) | Kardinal Offishall (participação de Akon) | Crowley year-end |
| 2008 | I Kissed a Girl | Katy Perry | Crowley year-end |
| 2009 | I Want to Know What Love Is | Mariah Carey | Brasil Hot 100 Airplay |
| 2009 | Talking to the Moon | Bruno Mars | Brasil Hot 100 Airplay |
| 2010 | Someone Like You | Adele | Brasil Hot 100 Airplay |
| 2010 | Wouldn't Change a Thing | Demi Lovato com a participação de Joe Jonas | wikipedia-category |
| 2011 | We Found Love | Rihanna part. Calvin Harris | Brasil Hot 100 Airplay |
| 2012 | Superstar | Madonna | wikipedia-category |
| 2014 | Vida | Ricky Martin | wikipedia-category |
| 2015 | Hello | Adele | Brasil Hot 100 Airplay |
| 2019 | Watermelon Sugar | Harry Styles | Crowley year-end |
| 2019 | Save Your Tears | The Weeknd | Crowley year-end |
| 2019 | Blinding Lights | The Weeknd | Crowley year-end |
| 2019 | Are U Gonna Tell Her? | Tove Lo com participação de MC Zaac | wikipedia-category |
| 2020 | Desce pro Play (PA PA PA) | Tyga, MC Zaac e Anitta | Top 50 Streaming |
| 2020 | Levitating | Dua Lipa (com participação de DaBaby) | Crowley year-end |
| 2021 | Leave the Door Open | Silk Sonic (Bruno Mars e Anderson .Paak) | Crowley year-end |
| 2021 | Brazil | Iggy Azalea | wikipedia-category |
| 2021 | We Don't Talk About Bruno | Carolina Gaitán, Mauro Castillo, Adassa, Rhenzy Feliz, Diane Guerrero, Stephanie Beatriz e elenco de Encanto | wikipedia-category |
| 2024 | São Paulo | The Weeknd e Anitta | wikipedia-category |

### Possible garbled titles

| Year | Title | Artist |
| --- | --- | --- |


### Reused Deezer IDs requiring review

| Deezer ID | Year | Title | Artist |
| --- | --- | --- | --- |


### Category rows excluded for missing/generic performer

| Category year | Page | Artist |
| --- | --- | --- |
| 1922 | Mulher Rendeira | (empty) |
| 1924 | Ave Maria (valsa) | (empty) |
| 1936 | Pierrô Apaixonado | (empty) |
| 1937 | Meu Limão, Meu Limoeiro | (empty) |
| 1937 | Mamãe Eu Quero | (empty) |
| 1937 | Eu Dei... | (empty) |
| 1937 | Cachorro Vira-Lata | (empty) |
| 1938 | E o mundo não se acabou | (empty) |
| 1939 | Cai, Cai | (empty) |
| 1940 | Você Já Foi à Bahia? | (empty) |
| 1940 | Disso É Que Eu Gosto | (empty) |
| 1942 | Ai! que saudade da Amélia | (empty) |
| 1943 | Chalana (canção) | (empty) |
| 1945 | Gente Humilde | (empty) |
| 1955 | Delicado | (empty) |
| 1955 | Juscelino é o homem | (empty) |
| 1956 | A Volta do Boêmio (canção) | (empty) |
| 1956 | Na Cadência do Samba (Que Bonito É) | (empty) |
| 1957 | Por Causa de Você (canção) | vários artistas |
| 1958 | Parabéns gaúcho | (empty) |
| 1958 | A Felicidade | (empty) |
| 1959 | Manhã de Carnaval | (empty) |
| 1959 | Bim Bom | (empty) |
| 1959 | Me Dá Um Dinheiro Aí | (empty) |
| 1959 | Jânio Vem Aí | (empty) |
| 1959 | A mesma rosa amarela | (empty) |
| 1960 | Alguém Me Disse | (empty) |
| 1960 | Coração de Luto (canção) | (empty) |
| 1960 | Varre, varre, vassourinha... | (empty) |
| 1961 | Água de Beber | (empty) |
| 1961 | Na Cadência do Samba | (empty) |
| 1962 | Samba em Prelúdio | (empty) |
| 1962 | Soul Bossa Nova | (empty) |
| 1963 | Parei na Contramão | (empty) |
| 1963 | Bonita (canção de Antônio Carlos Jobim) | (empty) |
| 1964 | Samba de Verão | (empty) |
| 1964 | O Calhambeque (Road Hog) | (empty) |
| 1965 | Tamandaré (canção) | (empty) |
| 1966 | Com açúcar, com afeto | (empty) |
| 1967 | Coração Vagabundo (canção) | (empty) |
| 1967 | Máscara Negra (canção) | (empty) |
| 1967 | Retrato em Branco e Preto | (empty) |
| 1968 | Transplante de Corintiano | (empty) |
| 1970 | Gente Humilde | (empty) |
| 1971 | Doce, Doce Amor | (empty) |
| 1972 | Cada Macaco no Seu Galho | (empty) |
| 1972 | Fio Maravilha (canção) | (empty) |
| 1973 | Fado Tropical | (empty) |
| 1974 | Camisa 10 (canção) | (empty) |
| 1975 | Dois pra Lá, Dois pra Cá | (empty) |
| 1975 | Ovelha Negra (canção) | (empty) |
| 1977 | O Cio da Terra | (empty) |
| 1977 | Odara (canção) | (empty) |
| 1978 | Sonho Meu (canção) | (empty) |
| 1978 | Zé do Caroço | (empty) |
| 1979 | Bye Bye Brasil (canção) | (empty) |
| 1979 | Rua Ramalhete | (empty) |
| 1981 | Agonia (canção) | Vários |
| 1981 | Perdidos na Selva | (empty) |
| 1981 | Rio Preto de Luto | (empty) |
| 1982 | Hard Candy Christmas | (empty) |
| 1982 | Flor do Sol | (empty) |
| 1983 | Coração de Estudante (canção) | (empty) |
| 1983 | São Paulo, São Paulo (canção) | (empty) |
| 1983 | Sou Boy | (empty) |
| 1984 | Chuva de Prata (canção) | (empty) |
| 1984 | Meu Erro | (empty) |
| 1985 | Choveu no meu chip | (empty) |
| 1988 | Besame | (empty) |
| 1988 | Malandragem (canção) | (empty) |
| 1988 | We Are the World of Carnaval | Vários Artistas |
| 1990 | Lullaby (canção de Cássia Eller) | (empty) |
| 1990 | O Papa É Pop (canção) | (empty) |
| 1991 | É o Amor (canção de Zezé Di Camargo & Luciano) | (empty) |
| 1991 | Pipoca com Guaraná | (empty) |
| 1992 | É o Amor (canção de Zezé Di Camargo & Luciano) | (empty) |
| 1992 | Eles (canção de Cássia Eller) | (empty) |
| 1992 | O Marginal (canção de Cássia Eller) | (empty) |
| 1993 | Lá Vem o Negão | (empty) |
| 1994 | Rap do Silva | (empty) |
| 1997 | Festa da Música (canção) | (empty) |
| 1997 | Palpite | (empty) |
| 1997 | São Paulo, São Paulo (canção) | (empty) |
| 2002 | Fico Assim Sem Você | (empty) |
| 2003 | Pensando em Você (canção de Paulinho Moska) | (empty) |
| 2007 | Nossa Música | (empty) |
| 2007 | Natiruts Reggae Power | (empty) |
| 2010 | Fugidinha | (empty) |
| 2010 | Nightcall | (empty) |
| 2011 | No Caminho do Milagre (canção) | (empty) |
| 2012 | Do Lado do Avesso (canção de Cássia Eller) | (empty) |
| 2012 | Menina Estranha | (empty) |
| 2012 | Não Me Perdoei | (empty) |
| 2012 | Quando Você Some | (empty) |
| 2013 | Esperança do Amanhecer | (empty) |
| 2013 | Na Linha do Tempo | (empty) |
| 2013 | Vem pra Rua | (empty) |
| 2017 | Me Libera Nega | (empty) |
| 2018 | Sofazinho | (empty) |
| 2018 | Vingança (canção) | (empty) |
| 2021 | Sol da Justiça (canção) | (empty) |
| 2024 | Descer pra BC | (empty) |
| 2025 | En 4 | (empty) |

### Chart pages with no parsed rows

(none)

### Curated rows not independently verified

| Year / chartYear | Title | Artist | Source |
| --- | --- | --- | --- |
| 1929 | Linda Flor (Ai, Ioiô) | Araci Cortes | curated |
| 1930 | Pra Você Gostar de Mim (Taí) | Carmen Miranda | curated |
| 1937 | Carinhoso | Orlando Silva (Pixinguinha) | curated |
| 1937 | Coração Materno | Vicente Celestino | curated |
| 1938 | Touradas em Madri | Almirante | curated |
| 1946 | Copacabana | Dick Farney (Braguinha e Alberto Ribeiro) | curated |
| 1949 | Chiquita Bacana | Emilinha Borba | curated |
| 1951 | Vingança | Linda Batista (Lupicínio Rodrigues) | curated |
| 1953 | Mulher Rendeira | Vanja Orico (trilha de O Cangaceiro) | curated |
| 1956 | Maracangalha | Dorival Caymmi | curated |
| 1957 | Rock and Roll em Copacabana | Cauby Peixoto | curated |
| 1958 | Chega de Saudade | Elizeth Cardoso / João Gilberto | curated |
| 1959 | Estúpido Cupido | Celly Campello | curated |
| 1959 | Desafinado | João Gilberto | curated |
| 1960 | Banho de Lua | Celly Campello | curated |
| 1963 | Mas Que Nada | Jorge Ben | curated |
| 1964 | É Proibido Fumar | Roberto Carlos | curated |
| 1965 | Arrastão | Elis Regina | curated |
| 1965 | Quero Que Vá Tudo pro Inferno | Roberto Carlos | curated |
| 1966 | A Banda | Chico Buarque | curated |
| 1966 | Disparada | Jair Rodrigues | curated |
| 1967 | Alegria, Alegria | Caetano Veloso | curated |
| 1967 | Domingo no Parque | Gilberto Gil | curated |
| 1967 | Ponteio | Edu Lobo | curated |
| 1968 | Pra Não Dizer Que Não Falei das Flores | Geraldo Vandré | curated |
| 1969 | As Curvas da Estrada de Santos | Roberto Carlos | curated |
| 1969 | Aquele Abraço | Gilberto Gil | curated |
| 1970 | Eu Te Amo, Meu Brasil | Os Incríveis | curated |
| 1970 | Jesus Cristo | Roberto Carlos | curated |
| 1971 | Detalhes | Roberto Carlos | curated |
| 1972 | Fio Maravilha | Jorge Ben | curated |
| 1973 | Sangue Latino | Secos & Molhados | curated |
| 1973 | Rosa de Hiroshima | Secos & Molhados | curated |
| 1974 | Águas de Março | Elis Regina e Tom Jobim | curated |
| 1974 | Gita | Raul Seixas | curated |
| 1975 | O Mestre-Sala dos Mares | Elis Regina (João Bosco e Aldir Blanc) | curated |
| 1976 | Como Nossos Pais | Elis Regina | curated |
| 1976 | Canto das Três Raças | Clara Nunes | curated |
| 1977 | Maluco Beleza | Raul Seixas | curated |
| 1977 | Cavalgada | Roberto Carlos | curated |
| 1978 | Cálice | Chico Buarque e Milton Nascimento | curated |
| 1978 | Sampa | Caetano Veloso | curated |
| 1979 | O Bêbado e a Equilibrista | Elis Regina | curated |
| 1979 | Mania de Você | Rita Lee | curated |
| 1980 | Lança Perfume | Rita Lee | curated |
| 1981 | Emoções | Roberto Carlos | curated |
| 1982 | Cor de Rosa Choque | Rita Lee | curated |
| 1982 | Você Não Soube Me Amar | Blitz | curated |
| 1983 | Menina Veneno | Ritchie | curated |
| 1983 | Como uma Onda | Lulu Santos | curated |
| 1984 | Bete Balanço | Barão Vermelho | curated |
| 1984 | Sonífera Ilha | Titãs | curated |
| 1985 | Exagerado | Cazuza | curated |
| 1986 | Eduardo e Mônica | Legião Urbana | curated |
| 1986 | Alagados | Os Paralamas do Sucesso | curated |
| 1987 | Faroeste Caboclo | Legião Urbana | curated |
| 1988 | Ideologia | Cazuza | curated |
| 1989 | Pais e Filhos | Legião Urbana | curated |
| 1989 | Flores | Titãs | curated |
| 1990 | Evidências | Chitãozinho & Xororó | curated |
| 1991 | É o Amor | Zezé Di Camargo & Luciano | curated |
| 1992 | Tô Feliz (Matei o Presidente) | Gabriel o Pensador | curated |
| 1994 | Jackie Tequila | Skank | curated |
| 1995 | Pelados em Santos | Mamonas Assassinas | curated |
| 1996 | Garota Nacional | Skank | curated |
| 1998 | Sozinho | Caetano Veloso | curated |
| 1999 | Anna Júlia | Los Hermanos | curated |
| 1999 | Sozinho | Caetano Veloso | buscape |
| 2000 | Se Eu Não Te Amasse Tanto Assim | Ivete Sangalo | buscape |
| 2001 | Quem de Nós Dois | Ana Carolina | buscape |
| 2002 | Carla | LS Jack | buscape |
| 2002 | Deixa a Vida Me Levar | Zeca Pagodinho | curated |
| 2003 | Velha Infância | Tribalistas | buscape |
| 2004 | Nosso Amor É Ouro | Zezé Di Camargo & Luciano | buscape |
| 2005 | Fui Eu | Zezé Di Camargo & Luciano | buscape |
| 2006 | Quando a Chuva Passar | Ivete Sangalo | buscape |
| 2007 | Deixo | Ivete Sangalo | buscape |
| 2008 | Boa Sorte / Good Luck | Vanessa da Mata (feat. Ben Harper) | buscape |
| 2008 | Dança do Créu | MC Créu | curated |
| 2009 | Me Encontra | Charlie Brown Jr. | buscape |
| 2011 | Amar Não É Pecado | Luan Santana | buscape |
| 2012 | Ai Se Eu Te Pego | Michel Teló | buscape |
| 2013 | Vidro Fumê | Bruno & Marrone | buscape |
| 2014 | Mozão | Lucas Lucco | buscape |
| 2015 | Escreve Aí | Luan Santana | crowley |
| 2016 | Infiel | Marília Mendonça | buscape |
| 2017 | Acordando o Prédio | Luan Santana | crowley |
| 2018 | Propaganda | Jorge & Mateus | buscape |
| 2018 | Largado às Traças | Zé Neto & Cristiano | crowley |
| 2019 | Lençol Dobrado | João Gustavo & Murilo | spotify |
| 2019 | Cem Mil | Gusttavo Lima | crowley |
| 2020 | Com ou Sem Mim | Gustavo Mioto | crowley |
| 2020 | Liberdade Provisória | Henrique & Juliano | spotify |
| 2021 | Facas | Diego & Victor Hugo e Bruno & Marrone | crowley |
| 2022 | Mal Feito | Hugo & Guilherme e Marília Mendonça | spotify |
| 2022 | Termina Comigo Antes | Gusttavo Lima | crowley |
| 2023 | Leão | Marília Mendonça | pro-musica |
| 2024 | Gosta de Rua (Ao Vivo) | Felipe & Rodrigo | pro-musica |
| 2025 | P do Pecado (Ao Vivo) | Grupo Menos é Mais e Simone Mendes | pro-musica |
| 2025 | Tubarões (Ao Vivo) | Diego & Victor Hugo | crowley |
