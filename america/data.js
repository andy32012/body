// U.S. Census Bureau regions; DC is a federal district, not a state.
// https://www.census.gov/programs-surveys/geography/about/glossary.html
export const regions = {
  west: {
    name: '西部', english: 'West', count: '13 個州',
    lead: '從太平洋海岸，一路走進山林。',
    description: '加州、華盛頓州與山區各州都在這一區，也包括阿拉斯加、夏威夷。海岸、高山與沙漠，可以是很不一樣的生活背景。',
    places: '西雅圖 · 舊金山 · 洛杉磯',
    codes: ['MT', 'ID', 'WY', 'CO', 'NM', 'AZ', 'UT', 'NV', 'WA', 'OR', 'CA', 'AK', 'HI'],
  },
  midwest: {
    name: '中西部', english: 'Midwest', count: '12 個州',
    lead: '從五大湖畔，認識美國的內陸。',
    description: '從芝加哥與五大湖出發，再往內陸各州探索。湖岸城市、河流與平原，提供不同的認識角度；每座城市都有自己的生活節奏。',
    places: '芝加哥 · 底特律 · 明尼亞波利斯',
    codes: ['OH', 'IN', 'IL', 'MI', 'WI', 'MN', 'IA', 'MO', 'ND', 'SD', 'NE', 'KS'],
  },
  south: {
    name: '南部', english: 'South', count: '16 州 ＋ DC',
    lead: '比「南方」兩個字，還要遼闊。',
    description: '人口普查的南部地區，從首都華盛頓特區延伸到佛羅里達、德州等地。先選一座城市，再看看它所在的州，比用一個印象概括更有意思。',
    places: '華盛頓特區 · 亞特蘭大 · 奧斯汀',
    codes: ['DE', 'MD', 'VA', 'WV', 'NC', 'SC', 'GA', 'FL', 'KY', 'TN', 'AL', 'MS', 'AR', 'LA', 'OK', 'TX', 'DC'],
  },
  northeast: {
    name: '東北部', english: 'Northeast', count: '9 個州',
    lead: '從大西洋沿岸，走進城市與歷史。',
    description: '從紐約的港口到波士頓的歷史步道，先用一座城市認識一段故事。紐約市位於紐約州；同樣的名字，可能指的是不同層級的地方。',
    places: '紐約 · 波士頓 · 費城',
    codes: ['ME', 'NH', 'VT', 'MA', 'RI', 'CT', 'NY', 'NJ', 'PA'],
  },
};

// Postal abbreviations: https://pe.usps.com/text/pub28/28apb.htm
export const states = [
  ['01', 'AL', 'Alabama', '阿拉巴馬州'], ['02', 'AK', 'Alaska', '阿拉斯加州'],
  ['04', 'AZ', 'Arizona', '亞利桑那州'], ['05', 'AR', 'Arkansas', '阿肯色州'],
  ['06', 'CA', 'California', '加州'], ['08', 'CO', 'Colorado', '科羅拉多州'],
  ['09', 'CT', 'Connecticut', '康乃狄克州'], ['10', 'DE', 'Delaware', '德拉瓦州'],
  ['11', 'DC', 'District of Columbia', '華盛頓特區'], ['12', 'FL', 'Florida', '佛羅里達州'],
  ['13', 'GA', 'Georgia', '喬治亞州'], ['15', 'HI', 'Hawaii', '夏威夷州'],
  ['16', 'ID', 'Idaho', '愛達荷州'], ['17', 'IL', 'Illinois', '伊利諾州'],
  ['18', 'IN', 'Indiana', '印第安納州'], ['19', 'IA', 'Iowa', '愛荷華州'],
  ['20', 'KS', 'Kansas', '堪薩斯州'], ['21', 'KY', 'Kentucky', '肯塔基州'],
  ['22', 'LA', 'Louisiana', '路易斯安那州'], ['23', 'ME', 'Maine', '緬因州'],
  ['24', 'MD', 'Maryland', '馬里蘭州'], ['25', 'MA', 'Massachusetts', '麻薩諸塞州'],
  ['26', 'MI', 'Michigan', '密西根州'], ['27', 'MN', 'Minnesota', '明尼蘇達州'],
  ['28', 'MS', 'Mississippi', '密西西比州'], ['29', 'MO', 'Missouri', '密蘇里州'],
  ['30', 'MT', 'Montana', '蒙大拿州'], ['31', 'NE', 'Nebraska', '內布拉斯加州'],
  ['32', 'NV', 'Nevada', '內華達州'], ['33', 'NH', 'New Hampshire', '新罕布夏州'],
  ['34', 'NJ', 'New Jersey', '紐澤西州'], ['35', 'NM', 'New Mexico', '新墨西哥州'],
  ['36', 'NY', 'New York', '紐約州'], ['37', 'NC', 'North Carolina', '北卡羅來納州'],
  ['38', 'ND', 'North Dakota', '北達科他州'], ['39', 'OH', 'Ohio', '俄亥俄州'],
  ['40', 'OK', 'Oklahoma', '奧克拉荷馬州'], ['41', 'OR', 'Oregon', '奧勒岡州'],
  ['42', 'PA', 'Pennsylvania', '賓夕法尼亞州'], ['44', 'RI', 'Rhode Island', '羅德島州'],
  ['45', 'SC', 'South Carolina', '南卡羅來納州'], ['46', 'SD', 'South Dakota', '南達科他州'],
  ['47', 'TN', 'Tennessee', '田納西州'], ['48', 'TX', 'Texas', '德州'],
  ['49', 'UT', 'Utah', '猶他州'], ['50', 'VT', 'Vermont', '佛蒙特州'],
  ['51', 'VA', 'Virginia', '維吉尼亞州'], ['53', 'WA', 'Washington', '華盛頓州'],
  ['54', 'WV', 'West Virginia', '西維吉尼亞州'], ['55', 'WI', 'Wisconsin', '威斯康辛州'],
  ['56', 'WY', 'Wyoming', '懷俄明州'],
].map(([fips, code, name, zh]) => ({
  fips, code, name, zh,
  region: Object.keys(regions).find(key => regions[key].codes.includes(code)),
}));
