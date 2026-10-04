/* 真太陽時：鐘錶時間 → 依出生地經度與均時差換算（與課程「調經度」做法相同）。純計算。 */
(function (root) {
  // 台灣主要縣市經度（東經）。海外或其他地點請手動輸入經度與時區。
  const CITIES = [
    ['台北', 121.5], ['新北', 121.46], ['基隆', 121.74], ['桃園', 121.3], ['新竹', 120.97], ['苗栗', 120.82],
    ['台中', 120.68], ['彰化', 120.54], ['南投', 120.69], ['雲林', 120.43], ['嘉義', 120.45], ['台南', 120.21],
    ['高雄', 120.3], ['屏東', 120.49], ['宜蘭', 121.75], ['花蓮', 121.6], ['台東', 121.15],
    ['澎湖', 119.57], ['金門', 118.32], ['馬祖', 119.95],
  ];

  /** 均時差（分鐘）：真太陽時 − 平太陽時。Spencer 近似，誤差約 ±0.5 分。 */
  function eot(y, m, d) {
    const n = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 864e5);
    const b = (2 * Math.PI * (n - 81)) / 365;
    return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  }

  /**
   * @param {{y,m,d,hh,mm,lon,tz?,dst?}} o  tz = 時區（東八區填 8，預設 8）；dst = 當時是否日光節約時間（要減一小時）
   * @returns {{y,m,d,hh,mm,delta}} 換算後的真太陽時（可能跨日），delta 為相差分鐘數
   */
  function convert(o) {
    const meridian = (o.tz == null ? 8 : o.tz) * 15;
    const delta = (o.lon == null ? 0 : (o.lon - meridian) * 4 + eot(o.y, o.m, o.d)) - (o.dst ? 60 : 0);
    const t = Date.UTC(o.y, o.m - 1, o.d, o.hh, o.mm) + Math.round(delta * 60000);
    const D = new Date(t);
    return { y: D.getUTCFullYear(), m: D.getUTCMonth() + 1, d: D.getUTCDate(), hh: D.getUTCHours(), mm: D.getUTCMinutes(), delta };
  }

  /** 時 → 時辰。23:00–24:00 回傳 late=true（晚子，排盤視為次日子時） */
  function branchOf(hh) {
    return { branch: Math.floor((hh + 1) / 2) % 12, late: hh >= 23 };
  }

  const api = { CITIES, eot, convert, branchOf };
  if (typeof module !== 'undefined') module.exports = api;
  else root.Solar = api;
})(typeof window !== 'undefined' ? window : globalThis);
