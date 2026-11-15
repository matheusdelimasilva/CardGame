/**
 * The arcade marquee: CARDGAME in a dark cabinet screen with a red inset
 * border, suits, a blinking INSERT COIN, scanlines and a rolling light band.
 * When `bare`, the cabinet fades away and only the outlined, glowing letters
 * stay (used on the game picker and settings screens).
 */
export function Logo({
  bare = false,
  scanlines = true,
}: {
  bare?: boolean;
  scanlines?: boolean;
}) {
  return (
    <div className={`marquee${bare ? " bare" : ""}`}>
      <div className="marquee-border marquee-fade" aria-hidden="true" />
      <div className="marquee-body">
        <div className="marquee-suits marquee-fade" aria-hidden="true">
          ♠ ♥ ♦ ♣
        </div>
        <h1 className="marquee-title">CARDGAME</h1>
        <div className="marquee-coin marquee-fade" aria-hidden="true">
          INSERT COIN
        </div>
      </div>
      {scanlines && (
        <div className="marquee-scan marquee-fade" aria-hidden="true" />
      )}
      <div className="marquee-roll marquee-fade" aria-hidden="true" />
    </div>
  );
}
