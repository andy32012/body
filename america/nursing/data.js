// Checked against the official sources linked beside the figures, 2026-11-21.
// Taiwan's annual and monthly figures describe different survey periods.
export const salaries = [
  { id: 'tw', currency: 'TWD', annual: { mean: 775000 }, year: 2024 },
  { id: 'rn', currency: 'USD', annual: { median: 97550, mean: 101420 }, year: 2025 },
  { id: 'np', currency: 'USD', annual: { median: 132300, mean: 137300 }, year: 2025 },
];

export const stages = {
  student: {
    title: '先讓學業、英文與文件，成為你的底氣。',
    summary: '還在學校時，可以先完成不依賴申請結果的準備；真正送件前再確認目標州的當期規則。',
    actions: [
      '把必修、實習與台灣考照準備排好；問系辦英文成績單、課綱、理論及實習時數能否依要求直接寄送。',
      '每週練病人評估、交班與日常聽說；選定州與認證用途後，再安排被接受的英文考試。',
      '先選兩至三個可能生活的州，逐項比較國際學歷、申請識別號碼、生活成本與職缺條件。',
    ],
  },
  taiwan: {
    title: '把台灣經驗，整理成目標州能審查的資料。',
    summary: '台灣證照與年資是你的背景；美國的學歷審查、應考資格和發照仍需各自完成。',
    actions: [
      '從目標州 Board of Nursing 的國際畢業生清單開始，確認文件來源、學歷評估機構及執照驗證方式。',
      '分開追蹤州申請、Pearson 註冊／ATT／NCLEX、英文／VisaScreen、雇主與工作身分，避免把其中一項完成當作全部完成。',
      '比較工作內容、排班、完整薪酬、訓練支援與合約條款；用實際 offer 和自己的生活預算試算。',
    ],
  },
  usrn: {
    title: '從想照顧的病人，反推適合的 NP 路線。',
    summary: '先決定角色、族群與執業州，再挑學校；RN 年資和一般護理學位不會自動換成 NP 資格。',
    actions: [
      '釐清家庭、成人老年、兒科、精神心理等方向，以及基層或急性照護場域；確認教育與認證相互對應。',
      '逐一查課程認證、入學條件、總費用、臨床實習安排，以及畢業後可申請的國家認證與州資格。',
      '向目標州查明 NP／APRN 執業及處方要求；同時評估進修期間的工作、收入與生活安排。',
    ],
  },
};
