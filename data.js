'use strict';
// Static tables: critters, rarities, breeding recipes, drones, weapons, prices, neighbours, random events.

const RARITY = [
  { name: 'обычный', color: '#efe8f7', glow: null, income: 1, sell: 8 },
  { name: 'необычный', color: '#7dff6a', glow: '125,255,106', income: 3, sell: 25 },
  { name: 'редкий', color: '#45d0ff', glow: '69,208,255', income: 6, sell: 60 },
  { name: 'ЭПИК', color: '#d38bff', glow: '211,139,255', income: 12, sell: 150 },
  { name: 'ЛЕГЕНДА', color: '#ffd84a', glow: '255,216,74', income: 25, sell: 400 },
];

// e: body emoji, acc: worn item, at: where the item sits (hat / feet / hand)
const SPECIES = {
  straw: { name: 'ИИ Клубника', e: '🍓', r: 0, say: ['клубни-клубни', 'я ИИ, но сладкая', 'не ешь меня'] },
  banana: { name: 'ИИ Банан', e: '🍌', r: 0, say: ['бананини!', 'я изогнут', 'банан в здании'] },
  tomato: { name: 'Помидорчелло', e: '🍅', r: 0, say: ['я овощ?', 'кетчуп-кетчуп'] },
  carrot: { name: 'Морковэлла', e: '🥕', r: 0, say: ['хрум', 'я вижу дронов'] },
  cherry: { name: 'Вишенка', e: '🍒', r: 1, say: ['нас двое', 'вишня-вишня'] },
  grape: { name: 'Виноградини', e: '🍇', r: 1, say: ['гроздь силы', 'виноградини!'] },
  melon: { name: 'Арбузилло', e: '🍉', r: 1, say: ['арбуз-арбуз', 'я тяжёлый'] },
  peach: { name: 'Персикано', e: '🍑', r: 1, say: ['персик-персик', 'ну чё'] },
  lemon: { name: 'Лимончелло', e: '🍋', r: 1, say: ['кисло', 'лимончелло!'] },
  chimp: { name: 'Шимпанзини Бананини', e: '🐒', acc: '🍌', at: 'hand', r: 2, say: ['ШИМПАНЗИНИ!', 'бананини-бананини'] },
  pine: { name: 'Ананасо Крокодило', e: '🍍', acc: '🐊', at: 'feet', r: 2, say: ['крокодило!', 'ананасо'] },
  coco: { name: 'Кокосини Бомбини', e: '🥥', acc: '💣', at: 'hand', r: 2, say: ['бомбини!', 'тик-так'] },
  frog: { name: 'Брр Брр Патапим', e: '🐸', acc: '🦶', at: 'feet', r: 2, say: ['брр брр', 'патапим'] },
  chimera: { name: 'Клубанана-Химера', e: '🍓', acc: '🍌', at: 'hat', r: 2, say: ['я ошибка ИИ', 'клубанана'] },
  shark: { name: 'Тралалело Тралала', e: '🦈', acc: '👟', at: 'feet', r: 3, say: ['тралалело тралала', 'кроссы новые'] },
  croc: { name: 'Бомбардиро Крокодило', e: '🐊', acc: '✈️', at: 'hat', r: 3, say: ['бомбардиро!', 'вжууух'] },
  coffee: { name: 'Капучино Ассассино', e: '☕', acc: '🗡️', at: 'hand', r: 3, say: ['капучино...', 'ассассино'] },
  eleph: { name: 'Лирили Ларила', e: '🐘', acc: '🌵', at: 'hand', r: 3, say: ['лирили ларила', 'ту-ту'] },
  beaver: { name: 'Бобрито Бандито', e: '🦫', acc: '🎩', at: 'hat', r: 3, say: ['бобрито!', 'бандито'] },
  cow: { name: 'Ла Вака Сатурно Сатурнита', e: '🐄', acc: '🪐', at: 'hat', r: 4, say: ['САТУРНИТА', 'муу в космосе'] },
  ballet: { name: 'Балерина Капучина', e: '☕', acc: '🩰', at: 'feet', r: 4, say: ['па-де-де', 'капучина!'] },
  gold: { name: 'Золотая Вишня', e: '🍒', r: 4, gold: true, special: true, say: ['я золотая', '$$$'] },
};

const BY_RARITY = [[], [], [], [], []];
for (const id in SPECIES) if (!SPECIES[id].special) BY_RARITY[SPECIES[id].r].push(id);

// Parent pair (ids sorted) → [child, chance] tried in order before the generic rarity roll.
const RECIPES = {
  'banana+straw': [['cherry', 0.55], ['chimera', 0.12]],
  'banana+banana': [['chimp', 0.25], ['lemon', 0.2]],
  'straw+straw': [['tomato', 0.25], ['peach', 0.2]],
  'cherry+cherry': [['gold', 0.06], ['grape', 0.3]],
  'cherry+straw': [['gold', 0.02], ['peach', 0.25]],
  'banana+chimp': [['chimp', 0.4]],
  'chimp+chimp': [['beaver', 0.2]],
  'carrot+tomato': [['pine', 0.15]],
  'pine+pine': [['croc', 0.3]],
  'coffee+coffee': [['ballet', 0.25]],
  'croc+shark': [['coffee', 0.25]],
};

const DRONES = {
  thief: { r: 0.2, hp: w => 2 + Math.floor(w / 2.5), speed: w => Math.min(2.2, 1.05 + w * 0.04), coins: 3 },
  kami: { r: 0.17, hp: w => 1 + Math.floor(w / 3.5), speed: w => Math.min(2.8, 1.5 + w * 0.05), coins: 2, dmg: 18 },
  tank: { r: 0.3, hp: w => 12 + w * 2, speed: () => 0.55, coins: 12, dps: 7 },
  boss: { r: 0.62, hp: w => 80 + w * 18, speed: () => 0.4, coins: 150, dps: 14 },
  mini: { r: 0.11, hp: () => 1, speed: () => 2, coins: 1, dmg: 5 },
  bomber: { r: 0.26, coins: 10 },
};

const WEAPONS = [
  { e: '👋', name: 'Ладошка', dmg: 1, splash: 0, cost: 0, hit: ['ШЛЁП!', 'ХЛОП!'] },
  { e: '🩴', name: 'Тапок', dmg: 2, splash: 0, cost: 80, hit: ['ТАПОК!', 'ШМЯК!'] },
  { e: '🍳', name: 'Сковородка', dmg: 3, splash: 0.45, cost: 300, hit: ['ДЗЫНЬ!', 'БАМ!'] },
  { e: '🔨', name: 'Кувалда', dmg: 5, splash: 0.6, cost: 800, hit: ['ХРЯСЬ!', 'БАЦ!'] },
  { e: '🏏', name: 'Бита Сахура', dmg: 8, splash: 0.8, cost: 2000, hit: ['ТУН!', 'САХУР!'] },
];

const GYM_COST = [200, 500, 1100, 2200, 4000];

// n = how many of that thing this farm has already bought
const PRICE = {
  pen: n => Math.round(40 * Math.pow(1.3, n)),
  hut: n => Math.round(120 * Math.pow(1.45, n)),
  hangar: n => Math.round(350 * Math.pow(1.6, n)),
  land: n => Math.round(30 * Math.pow(1.25, n)),
  critter: 25,
  seed: 70,
  repair: 60,
};

// Neighbour farms: 3x3 plots around ours. gx/gy = top-left tile.
const NEIGHBORS = [
  { name: 'Ранчо Бобрито', mascot: 'beaver', color: '#ff8a3d', wall: '#c8662a', roof: '#6b3416', likes: 'banana', aggr: 1.3, gx: -7, gy: 1 },
  { name: 'Капучино Корп', mascot: 'coffee', color: '#b07cff', wall: '#7a55c9', roof: '#3b2466', likes: 'straw', aggr: 1.0, gx: 11, gy: 1 },
  { name: 'Шимпанзини Плантейшн', mascot: 'chimp', color: '#6ef06a', wall: '#3f9e4a', roof: '#1f5426', likes: 'banana', aggr: 0.6, gx: 2, gy: -7 },
  { name: 'Тралалело Холдинг', mascot: 'shark', color: '#ff5fa2', wall: '#d14c8a', roof: '#6b1f45', likes: 'straw', aggr: 0.9, gx: 2, gy: 9 },
];
const PLAYER_COLOR = '#ffd84a';

const EVENTS = {
  coinrain: { title: 'ДОЖДЬ ИЗ МОНЕТ', sub: 'води мышкой по монетам', color: '#ffd84a', good: true, dur: 9, w: 3 },
  golden: { title: 'ЗОЛОТАЯ ВИШНЯ', sub: 'бегает по ферме, лови кликами!', color: '#ffd84a', good: true, dur: 0, w: 2 },
  energy: { title: 'ДРОНЫ НА ЭНЕРГЕТИКАХ', sub: 'скорость дронов x1.6', color: '#ff4f6d', good: false, dur: 14, w: 2 },
  party: { title: 'САХУР-ПАТИ', sub: 'твои сахуры бьют в два раза чаще', color: '#ffb36b', good: true, dur: 15, w: 2 },
  radio: { title: 'РАДИОАКТИВНЫЙ ДОЖДЬ', sub: 'яйца x3 быстрее, мутации чаще', color: '#8dff5a', good: true, dur: 15, w: 2 },
  swarm: { title: 'РОЙ МОШКАРЫ', sub: 'тьма мелких дронов', color: '#ff4f6d', good: false, dur: 0, w: 2 },
  tax: { title: 'НАЛОГОВАЯ', sub: '', color: '#ff4f6d', good: false, dur: 0, w: 1 },
  wallet: { title: 'НАШЁЛ КОШЕЛЁК', sub: '', color: '#7dff6a', good: true, dur: 0, w: 2 },
  sahurrain: { title: 'ТУН ТУН ДОЖДЬ', sub: 'с неба падают сахуры', color: '#ffb36b', good: true, dur: 0, w: 2 },
  disco: { title: 'ДИСКОТЕКА', sub: 'зверята танцуют, доход x2', color: '#ff7ae0', good: true, dur: 12, w: 2 },
  zap: { title: 'ВСПЫШКА НА СОЛНЦЕ', sub: '', color: '#45d0ff', good: true, dur: 0, w: 2 },
  feud: { title: 'СОСЕДИ ПОДРАЛИСЬ', sub: '', color: '#ff8a3d', good: true, dur: 0, w: 2 },
  betray: { title: 'ПРЕДАТЕЛЬСТВО!', sub: '', color: '#ff4f6d', good: false, dur: 0, w: 0.7 },
};

const PHRASES = ['67', 'скибиди', 'брейнрот', 'тун тун?', 'я ИИ', 'хочу на волю', 'ля-ля-ля', 'бро', 'вайб', 'кто тут дрон', 'сахур где', 'мама я в клетке'];
const PANIC = ['АААА', 'ДРОН!!', 'спасите', 'не бери меня', 'мама дрон', 'ТУН ТУН ПОМОГИ'];
const TUN_WORDS = ['ТУН!', 'ТУН ТУН!', 'САХУР!', 'БОНК!', 'ТУН!'];
const WAVE_SUBS = ['дроны летят со всех сторон', 'защити зверят!', 'тун тун тун...', 'им нужна твоя клубника', 'бей по дронам!', 'сахуры, к бою!'];
