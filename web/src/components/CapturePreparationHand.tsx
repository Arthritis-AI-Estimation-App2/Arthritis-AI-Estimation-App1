// 手首から5本の指までを一筆の輪郭でつないだ、右手の甲の基本形。
const handOutline = [
  "M 84 258 L 84 246",
  // 親指側の手首・甲から、斜めに開いた親指へ。
  "C 85 226 83 212 75 200",
  "C 68 190 57 183 49 171",
  "L 25 135",
  "C 21 129 23 121 29 117",
  "C 35 113 43 115 47 122",
  "L 65 147",
  "C 70 153 78 148 77 140",
  // 人差し指。側面を緩やかに広げ、指先に丸みを持たせる。
  "C 74 118 70 80 68 56",
  "C 67 47 72 40 80 39",
  "C 88 38 94 44 95 53",
  "L 100 112",
  "C 101 121 108 120 108 112",
  // 中指を最も長くし、指の間を小さな曲線でつなぐ。
  "L 109 32",
  "C 109 23 114 17 122 17",
  "C 130 17 135 23 135 32",
  "L 134 111",
  "C 134 120 141 122 143 113",
  // 薬指。
  "L 148 49",
  "C 149 40 155 35 162 36",
  "C 170 37 174 44 173 53",
  "L 166 124",
  "C 165 133 172 137 175 128",
  // 小指は薬指より短く、外側へ少し開く。
  "L 185 89",
  "C 187 81 192 77 199 79",
  "C 206 81 209 87 207 95",
  "L 193 156",
  // 小指側の甲を滑らかに絞り、手首まで収める。
  "C 190 172 181 188 172 200",
  "C 164 211 162 225 163 246",
  "L 163 258",
].join(" ");

export default function CapturePreparationHand() {
  return (
    <svg
      role="img"
      aria-label="指先が下を向いた左手の甲のイラスト。爪が見える向きで指を自然に開き、手首まで写します"
      viewBox="0 0 240 270"
      className="h-full w-auto text-primary"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* 右手の基本形を上下反転し、指先が下を向く左手の甲として表示する。 */}
      <g transform="translate(0 270) scale(1 -1)">
        <path d={`${handOutline} Z`} className="fill-surface" stroke="none" />
        <path d={`${handOutline} Z`} fill="currentColor" fillOpacity="0.06" stroke="none" />
        <path d={handOutline} strokeOpacity="0.85" />
        {/* 爪を指先の内側に置き、手の甲の向きと指の軸を示す。 */}
        <g strokeWidth="1.2" strokeOpacity="0.45" className="fill-surface" fillOpacity="0.8">
          <path d="M -6 8 Q -6 3 0 3 Q 6 3 6 8 L 5.5 17 Q 0 20 -5.5 17 Z" transform="translate(31 119) rotate(-34)" />
          <path d="M -7 8 Q -7 3 0 3 Q 7 3 7 8 L 6.5 19 Q 0 22 -6.5 19 Z" transform="translate(81 43) rotate(-5)" />
          <path d="M -7 8 Q -7 3 0 3 Q 7 3 7 8 L 6.5 20 Q 0 23 -6.5 20 Z" transform="translate(122 21)" />
          <path d="M -6.5 8 Q -6.5 3 0 3 Q 6.5 3 6.5 8 L 6 19 Q 0 22 -6 19 Z" transform="translate(161 40) rotate(5)" />
          <path d="M -5.5 7 Q -5.5 3 0 3 Q 5.5 3 5.5 7 L 5 16 Q 0 19 -5 16 Z" transform="translate(198 82) rotate(14)" />
        </g>
      </g>
      <path d="M30 12H12v18M210 12h18v18M12 240v18h18M228 240v18h-18" strokeWidth="1.6" strokeOpacity="0.35" />
    </svg>
  );
}
