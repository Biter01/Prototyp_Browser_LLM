import { writeFileSync } from "node:fs";

let idCounter = 0;
function uid(prefix) {
  idCounter++;
  const hex = String(idCounter).padStart(12, "0");
  return `${prefix}-${hex.slice(0, 8)}-${hex.slice(8, 12)}-0000-000000000000`;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const MALE_SIZES = ["S", "M", "L", "XL", "XXL"];
const FEMALE_SIZES = ["XS", "S", "M", "L", "XL"];
const UNISEX_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const SHOE_SIZES = [38, 39, 40, 41, 42, 43, 44, 45, 46];

function pickGender() {
  const r = Math.random();
  if (r < 0.4) return "male";
  if (r < 0.8) return "female";
  return "unisex";
}

const categories = [
  { id: uid("cat"), name: "Electronics & Gadgets", description: "Laptops, tablets, headphones, USB hubs, power banks, monitors, webcams, keyboards, mice and other tech essentials for JKU students" },
  { id: uid("cat"), name: "Textbooks & Stationery", description: "Mathematics, computer science and engineering textbooks, notebooks, pens, planners, whiteboards, calculators and study supplies" },
  { id: uid("cat"), name: "JKU Merchandise & Apparel", description: "Official JKU Linz hoodies, t-shirts, caps, tote bags, mugs and branded merchandise for proud Kepler University students" },
  { id: uid("cat"), name: "Campus Clothing", description: "Winter jackets, rain jackets, sneakers, thermal wear, casual shirts and everyday fashion for campus life" },
  { id: uid("cat"), name: "Software & Subscriptions", description: "Office 365, JetBrains, Adobe Creative Cloud, GitHub Student Developer Pack, cloud storage and academic software licenses" },
  { id: uid("cat"), name: "Campus Accessories", description: "Backpacks, water bottles, umbrellas, bike lights, lunch boxes, phone cases and everyday carry items for JKU students" },
];

const vendors = [
  { id: uid("ven"), name: "JKU Campus Shop", rating: 4.8 },
  { id: uid("ven"), name: "Amazon.at", rating: 4.6 },
  { id: uid("ven"), name: "MediaMarkt", rating: 4.3 },
  { id: uid("ven"), name: "Thalia.at", rating: 4.1 },
  { id: uid("ven"), name: "RS Components", rating: 4.0 },
];

const warehouses = [
  { id: uid("war"), name: "Linz (JKU Campus)", country: "AT", packageTax: 300 },
  { id: uid("war"), name: "Wien", country: "AT", packageTax: 300 },
  { id: uid("war"), name: "München", country: "DE" },
  { id: uid("war"), name: "Amsterdam", country: "NL" },
];

const vouchers = [
  { code: "WELCOME10", type: "percent", value: 10, description: "10% off your first order" },
  { code: "STUDENT20", type: "percent", value: 20, categoryId: categories[3].id, description: "20% off campus clothing" },
  { code: "FLAT500", type: "fixed", value: 500, description: "500 cents off any order" },
  { code: "MINORDER3000", type: "fixed", value: 1000, minOrderValue: 5000, description: "1000 cents off orders over 5000 cents" },
  { code: "EXPIRED2024", type: "percent", value: 15, validUntil: "2024-12-31", description: "15% off (expired)" },
  { code: "JKULINZ10", type: "percent", value: 10, categoryId: categories[2].id, description: "10% off JKU merchandise" },
  { code: "NEAREXPIRY", type: "percent", value: 10, validUntil: "2026-08-31", description: "10% off - expiring soon" },
  { code: "GROSSORDER15", type: "percent", value: 15, minOrderValue: 30000, description: "15% off orders over €300" },
];

// vendor index → [allowed warehouse indices]
const vendorWarehouses = [
  [0],
  [0, 1, 2, 3],
  [1, 2],
  [0, 1, 2],
  [1, 2, 3],
];

// vendor index → { freeProb: 0..1, paidCosts: [...] }
const vendorShippingProfiles = [
  { freeProb: 0.98, paidCosts: [0] },
  { freeProb: 0.95, paidCosts: [295, 395] },
  { freeProb: 0.85, paidCosts: [395, 495, 595] },
  { freeProb: 0.85, paidCosts: [395, 495, 595] },
  { freeProb: 0.60, paidCosts: [295, 395, 495, 595, 695] },
];

function generateOffer(vendorIdx, basePrice) {
  const vendor = vendors[vendorIdx];
  const whIdx = pick(vendorWarehouses[vendorIdx]);
  const warehouse = warehouses[whIdx];
  const priceMultiplier = [1.0, 0.98, 1.02, 0.95, 0.85][vendorIdx];
  const price = Math.round(basePrice * priceMultiplier * (0.92 + Math.random() * 0.16) / 100) * 100;
  const profile = vendorShippingProfiles[vendorIdx];
  const isFree = Math.random() < profile.freeProb;
  const shippingCost = isFree ? 0 : pick(profile.paidCosts.length ? profile.paidCosts : [0]);
  return {
    id: uid("off"),
    vendorId: vendor.id,
    warehouseId: warehouse.id,
    price,
    currency: "EUR",
    shippingCost,
    freeShippingThreshold: shippingCost > 0 ? price * 3 : undefined,
    deliveryDays: { min: randInt(1, 3), max: randInt(3, 12) },
    stock: (() => { const s = Math.random() < 0.08 ? 0 : Math.random() < 0.12 ? randInt(1, 5) : randInt(0, 500); return s === 0 ? "NO" : s <= 10 ? "LITTLE" : "ALOT"; })(),
  };
}

function generateOffers(basePrice, minV = 2, maxV = 4) {
  const numOffers = randInt(minV, maxV);
  const used = new Set();
  const offers = [];
  for (let i = 0; i < numOffers; i++) {
    let vi;
    do {
      vi = randInt(0, vendors.length - 1);
    } while (used.has(vi));
    used.add(vi);
    offers.push(generateOffer(vi, basePrice));
  }
  return offers;
}

function makeVariants(skuPrefix, configs, basePrice, priceFn) {
  return configs.map((cfg) => {
    const variantPrice = priceFn ? priceFn(basePrice, cfg) : basePrice;
    return {
      id: uid("var"),
      sku: `${skuPrefix}-${cfg.name ? cfg.name.replace(/[\s/]/g, "").slice(0, 8) : "var"}`,
      name: cfg.name || "",
      attributes: cfg.attrs || {},
      offers: generateOffers(variantPrice),
    };
  });
}

function randomTags(pool) {
  const defaultPool = ["new", "bestseller", "sale", "trending", "limited", "premium", "budget", "eco-friendly", "wireless", "waterproof", "lightweight", "durable", "ergonomic", "gaming", "professional", "student", "travel", "home", "top-rated", "exclusive"];
  const src = pool || defaultPool;
  const count = randInt(1, 4);
  const tags = new Set();
  while (tags.size < count) tags.add(pick(src));
  return [...tags];
}

// ── Category product definitions ──────────────────────────────────

const electronicsCatId = categories[0].id;
const textbooksCatId = categories[1].id;
const jkuMerchCatId = categories[2].id;
const clothingCatId = categories[3].id;
const softwareCatId = categories[4].id;
const accessoriesCatId = categories[5].id;

// ── Electronics & Gadgets (40) ────────────────────────────────────

const electronicsBrands = ["Lenovo", "Apple", "Dell", "HP", "Acer", "Samsung", "Sony", "Logitech", "Anker", "Satechi", "Razer", "SteelSeries", "LG", "ASUS", "Framework", "Microsoft", "Jabra", "Blue", "SanDisk", "Wacom", "TP-Link", "Google", "BenQ", "CalDigit", "Mophie", "Twelve South"];

const laptopConfigs = [
  { name: "8GB / 256GB SSD", attrs: { ram: 8, storage: "256GB SSD" } },
  { name: "16GB / 512GB SSD", attrs: { ram: 16, storage: "512GB SSD" } },
  { name: "32GB / 1TB SSD", attrs: { ram: 32, storage: "1TB SSD" } },
  { name: "64GB / 2TB SSD", attrs: { ram: 64, storage: "2TB SSD" } },
];

const electronicsProducts = [
  { name: "ThinkPad X1 Carbon Student Edition", brand: "Lenovo", desc: "Lightweight 14-inch business ultrabook with Intel Core i7, 16GB RAM and 512GB SSD — perfect for JKU computer science students", basePrice: 159900, attrs: { cpu: "Intel Core i7-1365U", display: "14\" WUXGA", weight: "1.12kg", battery: "15h", os: "Windows 11 Pro" }, tags: ["student", "professional", "lightweight"] },
  { name: "MacBook Air M3 Student Bundle", brand: "Apple", desc: "13.6-inch MacBook Air with M3 chip, 16GB unified memory and 512GB SSD — includes JKU student discount", basePrice: 149900, attrs: { cpu: "Apple M3", display: "13.6\" Liquid Retina", weight: "1.24kg", battery: "18h", os: "macOS Sonoma" }, tags: ["student", "premium", "lightweight"] },
  { name: "Dell XPS 13 Campus Edition", brand: "Dell", desc: "InfinityEdge 13.4-inch laptop with Intel Core i7, ideal for taking notes and coding at JKU", basePrice: 139900, attrs: { cpu: "Intel Core i7-1360P", display: "13.4\" FHD+", weight: "1.17kg", battery: "12h", os: "Windows 11 Home" }, tags: ["student", "premium", "lightweight"] },
  { name: "HP Pavilion Student Laptop 15", brand: "HP", desc: "Affordable 15.6-inch laptop with AMD Ryzen 5, great for JKU students on a budget", basePrice: 69900, attrs: { cpu: "AMD Ryzen 5 7530U", display: "15.6\" FHD", weight: "1.75kg", battery: "10h", os: "Windows 11 Home" }, tags: ["student", "budget"] },
  { name: "Acer Swift 3 University Pack", brand: "Acer", desc: "14-inch ultrabook with AMD Ryzen 7, comes with pre-installed Office 365 for JKU students", basePrice: 84900, attrs: { cpu: "AMD Ryzen 7 7840U", display: "14\" FHD", weight: "1.4kg", battery: "12h", os: "Windows 11 Home" }, tags: ["student", "top-rated", "exclusive"] },
  { name: "iPad Air 11 with Apple Pencil", brand: "Apple", desc: "11-inch iPad Air with M2 chip and Apple Pencil Pro — digital note-taking essential for JKU lectures", basePrice: 84900, attrs: { cpu: "Apple M2", display: "11\" Liquid Retina", weight: "462g", battery: "10h", os: "iPadOS 18" }, tags: ["student", "new"] },
  { name: "Samsung Galaxy Tab S9 FE", brand: "Samsung", desc: "10.9-inch tablet with S Pen included, perfect for reading JKU textbooks and taking notes", basePrice: 54900, attrs: { cpu: "Exynos 1380", display: "10.9\" TFT", weight: "523g", battery: "12h", os: "Android 14" }, tags: ["student", "budget"] },
  { name: "Kindle Paperwhite", brand: "Amazon", desc: "6.8-inch e-reader with warm light, waterproof — carry all your JKU textbooks in one lightweight device", basePrice: 19999, attrs: { display: "6.8\" E-Ink", weight: "205g", storage: "16GB", waterproof: true }, tags: ["student", "lightweight", "eco-friendly"] },
  { name: "Sony WH-1000XM5 Headphones", brand: "Sony", desc: "Industry-leading noise cancelling headphones for focused study sessions at the JKU library", basePrice: 34900, attrs: { type: "Over-Ear", connectivity: "Bluetooth 5.2", battery: "40h", color: "Black" }, tags: ["premium", "new", "wireless"] },
  { name: "Apple AirPods Pro 2", brand: "Apple", desc: "Active noise cancelling earbuds with USB-C, perfect for studying at JKU Learning Center", basePrice: 21900, attrs: { type: "In-Ear", connectivity: "Bluetooth 5.3", battery: "6h", color: "White" }, tags: ["premium", "wireless", "student"] },
  { name: "Logitech MX Master 3S Mouse", brand: "Logitech", desc: "Premium wireless mouse with quiet clicks, ergonomic design for long coding sessions at JKU", basePrice: 15999, attrs: { connectivity: "Bluetooth/USB-C", dpi: "8000", battery: "70 days", color: "Graphite" }, tags: ["premium", "ergonomic", "professional"] },
  { name: "Cherry MX Mechanical Keyboard", brand: "Cherry", desc: "Full-size mechanical keyboard with Cherry MX Red switches, ideal for JKU programming assignments", basePrice: 15999, attrs: { layout: "DE-ISO", switches: "Cherry MX Red", connectivity: "USB-C", color: "Black" }, tags: ["professional", "durable"] },
  { name: "Samsung 27\" 4K Monitor", brand: "Samsung", desc: "27-inch 4K UHD monitor with USB-C hub, perfect dual-screen setup for JKU home office", basePrice: 35900, attrs: { size: "27\"", resolution: "4K UHD", panel: "IPS", connectivity: "USB-C/HDMI/DP" }, tags: ["professional", "premium"] },
  { name: "Dell 24\" FHD Monitor", brand: "Dell", desc: "24-inch Full HD monitor with adjustable stand, great budget option for JKU students", basePrice: 16900, attrs: { size: "24\"", resolution: "FHD", panel: "IPS", connectivity: "HDMI/DP" }, tags: ["student", "budget"] },
  { name: "Logitech C920s HD Pro Webcam", brand: "Logitech", desc: "Full HD 1080p webcam with privacy shutter, essential for JKU online lectures and exams", basePrice: 14999, attrs: { resolution: "1080p", fov: "78°", mic: "Stereo", connectivity: "USB-A" }, tags: ["student", "professional", "new"] },
  { name: "Blue Yeti USB Microphone", brand: "Blue", desc: "Professional USB condenser microphone for JKU podcast projects and group presentations", basePrice: 15999, attrs: { type: "Condenser", pattern: "Cardioid", connectivity: "USB-C", color: "Black" }, tags: ["professional", "premium"] },
  { name: "Jabra Evolve2 50 Headset", brand: "Jabra", desc: "Professional UC headset with noise-cancelling microphone for JKU remote study groups", basePrice: 14999, attrs: { type: "Over-Ear", connectivity: "USB-A/USB-C", battery: "37h", color: "Black" }, tags: ["professional", "wireless"] },
  { name: "Samsung T7 Portable SSD 1TB", brand: "Samsung", desc: "Compact 1TB external SSD with USB 3.2, 1050MB/s — backup all your JKU projects", basePrice: 15999, attrs: { capacity: "1TB", interface: "USB 3.2 Gen2", speed: "1050MB/s", waterproof: true }, tags: ["student", "durable", "lightweight"] },
  { name: "SanDisk Extreme 2TB External SSD", brand: "SanDisk", desc: "Rugged 2TB portable SSD with IP65 rating, perfect for carrying JKU coursework safely", basePrice: 19999, attrs: { capacity: "2TB", interface: "USB 3.2 Gen2", speed: "1050MB/s", waterproof: true }, tags: ["professional", "durable"] },
  { name: "Wacom Intuos Small Drawing Tablet", brand: "Wacom", desc: "Compact drawing tablet for JKU design courses and digital note-taking on diagrams", basePrice: 14999, attrs: { size: "Small", activeArea: "7.6\" x 4.7\"", connectivity: "USB", pressure: "4096" }, tags: ["student", "budget"] },
  { name: "CalDigit TS4 Thunderbolt 4 Dock", brand: "CalDigit", desc: "18-port Thunderbolt 4 dock for JKU workstation setup — 98W charging, dual 6K displays", basePrice: 35999, attrs: { ports: "18x", charging: "98W", displays: "Dual 6K", speed: "40Gbps" }, tags: ["professional", "premium", "exclusive"] },
  { name: "LG UltraFine 27\" 5K Display", brand: "LG", desc: "27-inch 5K IPS monitor with Thunderbolt 3, the ultimate display for JKU design students", basePrice: 129999, attrs: { size: "27\"", resolution: "5K", panel: "IPS", connectivity: "Thunderbolt 3 x2" }, tags: ["premium", "professional", "exclusive"] },
  { name: "Microsoft Surface Laptop 5", brand: "Microsoft", desc: "Sleek 15-inch touchscreen laptop with Intel Core i7, stylish choice for JKU business students", basePrice: 139900, attrs: { cpu: "Intel Core i7-1265U", display: "15\" PixelSense Touch", weight: "1.56kg", battery: "17h", os: "Windows 11 Home" }, tags: ["student", "premium"] },
  { name: "ASUS ZenBook 14 OLED", brand: "ASUS", desc: "14-inch OLED laptop with Intel Core i7, stunning visuals for JKU multimedia projects", basePrice: 119900, attrs: { cpu: "Intel Core i7-1360P", display: "14\" 2.8K OLED", weight: "1.39kg", battery: "13h", os: "Windows 11 Home" }, tags: ["student", "premium", "professional"] },
  { name: "Lenovo Legion 5 Gaming Laptop", brand: "Lenovo", desc: "15.6-inch gaming laptop with RTX 4060, for JKU game dev students and weekend gamers", basePrice: 139900, attrs: { cpu: "AMD Ryzen 7 7840H", display: "15.6\" QHD 165Hz", gpu: "RTX 4060", weight: "2.4kg", os: "Windows 11 Home" }, tags: ["gaming", "student", "professional"] },
  { name: "Framework Laptop 13 DIY Edition", brand: "Framework", desc: "Fully repairable 13.5-inch laptop — upgrade RAM/storage/battery yourself, perfect for JKU engineering students", basePrice: 104900, attrs: { cpu: "Intel Core i7-1360P", display: "13.5\" 3:2 QHD", weight: "1.3kg", battery: "11h", os: "Windows 11 / Linux" }, tags: ["eco-friendly", "student", "new", "exclusive"] },
  { name: "Razer DeathAdder V3 Mouse", brand: "Razer", desc: "Ultralight 59g gaming mouse with 30K DPI sensor, for JKU esports club members", basePrice: 14999, attrs: { connectivity: "USB-C", dpi: "30000", weight: "59g", color: "Black" }, tags: ["gaming", "lightweight", "premium"] },
  { name: "SteelSeries Apex Pro TKL Keyboard", brand: "SteelSeries", desc: "Tenkeyless mechanical keyboard with adjustable OmniPoint switches, for JKU esports and coding", basePrice: 17999, attrs: { layout: "TKL DE-ISO", switches: "OmniPoint Adjustable", connectivity: "USB-C", color: "Black" }, tags: ["gaming", "professional", "premium"] },
  { name: "LG Gram 17", brand: "LG", desc: "Ultralight 17-inch laptop weighing only 1.35kg, huge screen for JKU spreadsheet and coding work", basePrice: 149900, attrs: { cpu: "Intel Core i7-1360P", display: "17\" WQXGA", weight: "1.35kg", battery: "19h", os: "Windows 11 Home" }, tags: ["lightweight", "professional", "premium"] },
  { name: "MSI Prestige 14 Evo", brand: "MSI", desc: "14-inch creator laptop with Intel Core i7, perfect for JKU media informatics students", basePrice: 119900, attrs: { cpu: "Intel Core i7-13700H", display: "14\" QHD+", gpu: "Iris Xe", weight: "1.49kg", os: "Windows 11 Home" }, tags: ["student", "professional"] },
  { name: "Samsung 32\" Curved Monitor", brand: "Samsung", desc: "32-inch curved QHD monitor, immersive display for JKU programming and design work", basePrice: 29900, attrs: { size: "32\"", resolution: "QHD", curvature: "1000R", panel: "VA" }, tags: ["professional", "gaming"] },
  { name: "TP-Link Archer AX72 WiFi 6 Router", brand: "TP-Link", desc: "AX5400 dual-band WiFi 6 router, ensure fast internet in your JKU dorm room", basePrice: 14999, attrs: { standard: "WiFi 6", speed: "AX5400", bands: "2.4GHz + 5GHz", ports: "Gigabit x4" }, tags: ["student", "new"] },
  { name: "Mophie 3-in-1 Wireless Charger", brand: "Mophie", desc: "Charge iPhone, Apple Watch and AirPods simultaneously at your JKU desk", basePrice: 14999, attrs: { type: "3-in-1 Pad", power: "15W", compatibility: "MagSafe", color: "White" }, tags: ["premium", "student"] },
  { name: "BenQ ScreenBar Halo", brand: "BenQ", desc: "Monitor-mounted LED lamp with ambient light sensor, reduces eye strain during late JKU study sessions", basePrice: 14999, attrs: { type: "Monitor Bar", brightness: "LED", control: "Wireless Remote", color: "Black" }, tags: ["premium", "student", "ergonomic"] },
  { name: "Twelve South BookBook Voltaire Case", brand: "Twelve South", desc: "Vintage book-style leather sleeve for MacBook, stylish protection for your JKU laptop", basePrice: 14999, attrs: { material: "Leather", fit: "13\" MacBook", color: "Vintage Brown" }, tags: ["premium", "student"] },
  { name: "Logitech StreamCam", brand: "Logitech", desc: "1080p 60fps webcam with auto-focus and vertical mount, for JKU content creators and streamers", basePrice: 14999, attrs: { resolution: "1080p 60fps", fov: "78°", mic: "Stereo", connectivity: "USB-C" }, tags: ["professional", "premium"] },
];

// ── Textbooks & Stationery (35) ───────────────────────────────────

const textbookBrands = ["Pearson", "Springer", "MIT Press", "O'Reilly", "Cambridge Press", "Oxford Press", "McGraw Hill", "Reynolds", "Leuchtturm", "Staedtler", "Moleskine", "Casio", "Texas Instruments"];

const textbookProducts = [
  { name: "Introduction to Algorithms (CLRS)", brand: "MIT Press", desc: "The definitive algorithms textbook for JKU computer science students — 4th edition, 1312 pages", basePrice: 7999, attrs: { edition: "4th", format: "Paperback", pages: 1312 } },
  { name: "Calculus: Early Transcendentals", brand: "Pearson", desc: "Essential calculus textbook for JKU mathematics and engineering students — 9th edition", basePrice: 8999, attrs: { edition: "9th", format: "Paperback", pages: 1152 } },
  { name: "Linear Algebra and Its Applications", brand: "Pearson", desc: "Standard linear algebra text used in JKU first-year mathematics courses — 6th edition", basePrice: 6999, attrs: { edition: "6th", format: "Paperback", pages: 864 } },
  { name: "The C Programming Language (K&R)", brand: "Prentice Hall", desc: "Classic C programming book by Kernighan and Ritchie — essential for JKU system programming labs", basePrice: 4999, attrs: { edition: "2nd", format: "Paperback", pages: 288 } },
  { name: "Structure and Interpretation of Computer Programs", brand: "MIT Press", desc: "Classic computer science text used in JKU functional programming courses — SICP 2nd edition", basePrice: 7999, attrs: { edition: "2nd", format: "Paperback", pages: 656 } },
  { name: "Artificial Intelligence: A Modern Approach", brand: "Pearson", desc: "Comprehensive AI textbook for JKU artificial intelligence courses — 5th edition", basePrice: 9999, attrs: { edition: "5th", format: "Paperback", pages: 1136 } },
  { name: "Database System Concepts", brand: "McGraw Hill", desc: "Complete database textbook for JKU database and information systems courses — 8th edition", basePrice: 7999, attrs: { edition: "8th", format: "Paperback", pages: 1376 } },
  { name: "Operating System Concepts", brand: "Wiley", desc: "The dinosaur book — OS textbook for JKU operating systems courses — 10th edition", basePrice: 7499, attrs: { edition: "10th", format: "Paperback", pages: 864 } },
  { name: "Computer Networking: A Top-Down Approach", brand: "Pearson", desc: "Networking textbook for JKU computer networks courses — 9th edition", basePrice: 6999, attrs: { edition: "9th", format: "Paperback", pages: 800 } },
  { name: "Mathematics for Machine Learning", brand: "Cambridge Press", desc: "Foundational math guide for JKU machine learning and data science courses", basePrice: 5999, attrs: { edition: "1st", format: "Paperback", pages: 392 } },
  { name: "Introduction to Probability", brand: "MIT Press", desc: "Complete probability textbook for JKU statistics and data science students", basePrice: 6499, attrs: { edition: "2nd", format: "Paperback", pages: 528 } },
  { name: "Learn You a Haskell for Great Good!", brand: "No Starch Press", desc: "Fun Haskell introduction for JKU functional programming courses", basePrice: 2999, attrs: { edition: "1st", format: "Paperback", pages: 200 } },
  { name: "Practical Vim", brand: "Pragmatic Bookshelf", desc: "Edit text at the speed of thought — for JKU students mastering the command line", basePrice: 2999, attrs: { edition: "2nd", format: "Paperback", pages: 352 } },
  { name: "Software Engineering at Google", brand: "O'Reilly", desc: "Modern software engineering practices for JKU software engineering courses", basePrice: 4499, attrs: { edition: "1st", format: "Paperback", pages: 600 } },
  { name: "Designing Data-Intensive Applications", brand: "O'Reilly", desc: "Fundamental guide to distributed systems for JKU advanced CS courses", basePrice: 4499, attrs: { edition: "1st", format: "Paperback", pages: 616 } },
  { name: "Clean Code: A Handbook of Agile Software Craftsmanship", brand: "Prentice Hall", desc: "Robert C. Martin's classic on writing clean code — essential for JKU software projects", basePrice: 3999, attrs: { edition: "1st", format: "Paperback", pages: 464 } },
  { name: "The Pragmatic Programmer", brand: "Addison-Wesley", desc: "Timeless tips for JKU students becoming professional software engineers — 20th anniversary edition", basePrice: 4999, attrs: { edition: "2nd", format: "Paperback", pages: 352 } },
  { name: "Leuchtturm1917 Notebook A5 Hardcover", brand: "Leuchtturm", desc: "Premium dotted notebook with 249 numbered pages — JKU students' favourite for lecture notes", basePrice: 2199, attrs: { size: "A5", type: "Dotted", pages: 249, color: "Black" } },
  { name: "Moleskine Classic Notebook Large", brand: "Moleskine", desc: "Iconic hardcover notebook with rounded corners, perfect for JKU lecture notes and sketches", basePrice: 2499, attrs: { size: "Large", type: "Ruled", pages: 240, color: "Red" } },
  { name: "Staedtler Noris HB Pencil Box (12)", brand: "Staedtler", desc: "Classic yellow HB pencils, 12-pack for JKU exams and math problem sets", basePrice: 699, attrs: { type: "HB", packSize: 12, brand: "Staedtler" } },
  { name: "Reynolds Ballpoint Pen Set (10)", brand: "Reynolds", desc: "Smooth-writing ballpoint pens, 10 assorted colors for JKU course note-taking", basePrice: 599, attrs: { type: "Ballpoint", packSize: 10, colors: "Assorted" } },
  { name: "Casio FX-991DE X Scientific Calculator", brand: "Casio", desc: "Advanced scientific calculator approved for JKU mathematics exams with natural display", basePrice: 3499, attrs: { type: "Scientific", display: "Natural-VPAM", power: "Solar+Battery" } },
  { name: "Texas Instruments TI-84 Plus CE-T", brand: "Texas Instruments", desc: "Graphing calculator with color display, approved for JKU advanced math and engineering exams", basePrice: 11999, attrs: { type: "Graphing", display: "Color", memory: "3MB", power: "Battery USB" } },
  { name: "Whiteboard Magnetic A1", brand: "OfficeLine", desc: "Magnetic whiteboard 60x90cm for JKU dorm room study sessions and group project planning", basePrice: 2999, attrs: { size: "A1 (60x90cm)", type: "Magnetic", includes: "Marker + Eraser" } },
  { name: "Oxford Campus Index Cards A5", brand: "Oxford", desc: "500 ruled index cards with storage box, perfect for JKU exam flash cards", basePrice: 899, attrs: { size: "A5", pages: 500, ruled: true } },
  { name: "Post-it Super Sticky Notes Assorted", brand: "3M", desc: "12 pads of super sticky notes in assorted neon colors for JKU study groups", basePrice: 1299, attrs: { pads: 12, colors: "Neon Assorted", size: "76x76mm" } },
  { name: "Stabilo Boss Highlighter Set (6)", brand: "Stabilo", desc: "Pastel highlighters, 6-pack in assorted colors for JKU textbook annotation", basePrice: 999, attrs: { packSize: 6, type: "Pastel", colors: "Assorted" } },
  { name: "Filofax A5 Organiser", brand: "Filofax", desc: "Leather ring binder planner to organise your JKU semester schedule and deadlines", basePrice: 3999, attrs: { size: "A5", material: "Leather", color: "Navy" } },
  { name: "Paperblanks Grand Journal Ultra", brand: "Paperblanks", desc: "Beautifully crafted hardcover journal with lock, for JKU creative writing and journaling", basePrice: 2199, attrs: { size: "Grand", type: "Lined", pages: 288, color: "Midnight Blue" } },
  { name: "Rhodia Goalbook A5", brand: "Rhodia", desc: "Dot-grid notebook with numbered pages and table of contents — stay organized at JKU", basePrice: 1799, attrs: { size: "A5", type: "Dot Grid", pages: 240, color: "Black" } },
  { name: "Faber-Castell 9000 Pencil Set (12)", brand: "Faber-Castell", desc: "Premium German pencils in assorted hardness grades for JKU technical drawing courses", basePrice: 1499, attrs: { packSize: 12, grades: "2H-8B", brand: "Faber-Castell" } },
  { name: "Tombow Dual Brush Pen Set (10)", brand: "Tombow", desc: "Water-based dual-tip brush pens for JKU bullet journaling and visual note-taking", basePrice: 2499, attrs: { packSize: 10, type: "Dual Brush", colors: "Assorted" } },
  { name: "Elmers Glue Stick Pack (6)", brand: "Elmers", desc: "Washable glue sticks for JKU poster presentations and craft projects", basePrice: 599, attrs: { packSize: 6, type: "Washable", weight: "22g each" } },
  { name: "Bic 4-Color Ballpoint Pen", brand: "Bic", desc: "Multi-color pen with blue, black, red and green ink — JKU exam essential", basePrice: 499, attrs: { colors: 4, type: "Ballpoint", ink: "Oil-based" } },
  { name: "Commodore 64 Programming Manual (Reprint)", brand: "Retro Press", desc: "Vintage programming manual reprint for JKU retro computing enthusiasts and CS history buffs", basePrice: 2499, attrs: { edition: "Reprint", format: "Paperback", pages: 200, topic: "Retro Computing" } },
];

// ── JKU Merchandise & Apparel (30) ────────────────────────────────

const jkuMerchProducts = [
  { name: "JKU Hoodie Premium", brand: "JKU Campus Shop", desc: "Official JKU Linz hoodie in black with embroidered logo — super soft 350gsm fleece", basePrice: 4999, attrs: { material: "350gsm Fleece", fit: "Regular", color: "Black" } },
  { name: "JKU Hoodie Premium Navy", brand: "JKU Campus Shop", desc: "Official JKU Linz hoodie in navy blue with embroidered logo — super soft 350gsm fleece", basePrice: 4999, attrs: { material: "350gsm Fleece", fit: "Regular", color: "Navy" } },
  { name: "JKU T-Shirt Classic", brand: "JKU Campus Shop", desc: "Official JKU Linz cotton t-shirt with screen-printed logo, available in multiple sizes", basePrice: 1999, attrs: { material: "100% Cotton", fit: "Regular", color: "White" } },
  { name: "JKU T-Shirt Classic Black", brand: "JKU Campus Shop", desc: "Official JKU Linz cotton t-shirt in black with white screen-printed logo", basePrice: 1999, attrs: { material: "100% Cotton", fit: "Regular", color: "Black" } },
  { name: "JKU Cap Snapback", brand: "JKU Campus Shop", desc: "Official JKU Linz snapback cap with embroidered KEPLER lettering", basePrice: 2499, attrs: { material: "Cotton Blend", type: "Snapback", color: "Black/White" } },
  { name: "JKU Beanie", brand: "JKU Campus Shop", desc: "Warm JKU Linz beanie with embroidered logo, perfect for cold Austrian winters", basePrice: 1499, attrs: { material: "Acrylic", color: "Black" } },
  { name: "JKU Tote Bag Canvas", brand: "JKU Campus Shop", desc: "Heavy-duty canvas tote bag with JKU Linz print — carry your textbooks in style", basePrice: 1499, attrs: { material: "Canvas", size: "42x38cm", color: "Natural" } },
  { name: "JKU Coffee Mug Ceramic", brand: "JKU Campus Shop", desc: "330ml ceramic mug with JKU logo — essential for your morning coffee before lectures", basePrice: 1299, attrs: { material: "Ceramic", capacity: "330ml", dishwasher_safe: true } },
  { name: "JKU Water Bottle Stainless", brand: "JKU Campus Shop", desc: "500ml insulated stainless steel bottle with JKU laser engraving", basePrice: 1999, attrs: { material: "Stainless Steel", capacity: "500ml", insulated: true } },
  { name: "JKU Lanyard", brand: "JKU Campus Shop", desc: "Official JKU Linz lanyard with detachable clip and ID card holder", basePrice: 699, attrs: { material: "Polyester", width: "20mm", color: "Black/Green" } },
  { name: "JKU Pin Set (5)", brand: "JKU Campus Shop", desc: "Set of 5 enamel pins with JKU and Linz landmarks — Kepler, Ars Electronica, etc.", basePrice: 999, attrs: { material: "Enamel", count: 5, backing: "Rubber Clutch" } },
  { name: "JKU Sticker Pack (10)", brand: "JKU Campus Shop", desc: "10 vinyl stickers with JKU logos and mottoes for your laptop and water bottle", basePrice: 499, attrs: { material: "Vinyl", count: 10, waterproof: true } },
  { name: "JKU Sweatpants", brand: "JKU Campus Shop", desc: "Comfortable JKU sweatpants with embroidered logo, ideal for studying in your dorm", basePrice: 3499, attrs: { material: "280gsm Fleece", fit: "Regular", color: "Black" } },
  { name: "JKU Zip Hoodie", brand: "JKU Campus Shop", desc: "Full-zip JKU hoodie with front pockets and embroidered logo on chest", basePrice: 5499, attrs: { material: "350gsm Fleece", fit: "Regular", color: "Navy" } },
  { name: "JKU Polo Shirt", brand: "JKU Campus Shop", desc: "Smart-casual JKU polo shirt with embroidered logo, for presentations and events", basePrice: 2999, attrs: { material: "Pique Cotton", fit: "Regular", color: "White" } },
  { name: "JKU Teddy Fleece Jacket", brand: "JKU Campus Shop", desc: "Snuggly teddy fleece jacket with JKU patch, cozy for JKU campus winter walks", basePrice: 4499, attrs: { material: "Polyester Fleece", fit: "Regular", color: "Cream" } },
  { name: "JKU Sports Bottle 750ml", brand: "JKU Campus Shop", desc: "Large 750ml sports bottle with JKU engraving, BPA-free Tritan material", basePrice: 1499, attrs: { material: "Tritan", capacity: "750ml", BPA_free: true, color: "Transparent" } },
  { name: "JKU Keychain Leather", brand: "JKU Campus Shop", desc: "Genuine leather keychain embossed with JKU Kepler University logo", basePrice: 899, attrs: { material: "Leather", color: "Brown" } },
  { name: "JKU Notebook A5", brand: "JKU Campus Shop", desc: "JKU-branded A5 notebook with 160 lined pages and bookmark ribbon", basePrice: 899, attrs: { size: "A5", pages: 160, type: "Lined", color: "Black" } },
  { name: "JKU Mouse Pad", brand: "JKU Campus Shop", desc: "JKU branded mouse pad with non-slip rubber base, 25x20cm", basePrice: 699, attrs: { size: "25x20cm", material: "Cloth/Rubber", color: "Black" } },
  { name: "JKU Phone Case iPhone 15", brand: "JKU Campus Shop", desc: "Shock-absorbent phone case with JKU print, designed for iPhone 15/15 Pro", basePrice: 1499, attrs: { compatible: "iPhone 15/15 Pro", material: "TPU+PC", color: "Clear/Black" } },
  { name: "JKU Phone Case Samsung S24", brand: "JKU Campus Shop", desc: "Shock-absorbent phone case with JKU print, designed for Samsung Galaxy S24", basePrice: 1499, attrs: { compatible: "Samsung Galaxy S24", material: "TPU+PC", color: "Clear/Black" } },
  { name: "JKU Umbrella Compact", brand: "JKU Campus Shop", desc: "Compact travel umbrella with JKU logo and auto-open mechanism", basePrice: 1999, attrs: { type: "Compact Auto-Open", canopy: "95cm", color: "Black with JKU Logo" } },
  { name: "JKU Baseball Cap Dad Style", brand: "JKU Campus Shop", desc: "Curved-bill dad-style cap with embroidered JKU text, garment-washed for a relaxed look", basePrice: 1999, attrs: { material: "Cotton Twill", type: "Dad Cap", color: "Khaki" } },
  { name: "JKU Scarf", brand: "JKU Campus Shop", desc: "Soft acrylic scarf in JKU colours with tassels, 180x30cm", basePrice: 1999, attrs: { material: "Acrylic", size: "180x30cm", color: "Black/Green" } },
  { name: "JKU Duffel Bag", brand: "JKU Campus Shop", desc: "Large 45L duffel bag with JKU print, perfect for JKU sports club and gym sessions", basePrice: 3499, attrs: { capacity: "45L", material: "Polyester", color: "Black" } },
  { name: "JKU Cushion", brand: "JKU Campus Shop", desc: "Soft cushion with JKU embroidery, 40x40cm with removable cover", basePrice: 1999, attrs: { size: "40x40cm", material: "Polyester Velvet", color: "Black" } },
  { name: "JKU Pencil Case", brand: "JKU Campus Shop", desc: "JKU branded pencil case with double zipper, holds 40+ pens", basePrice: 999, attrs: { material: "Polyester", size: "20x10x5cm", color: "Black" } },
  { name: "JKU Graduation Cap Keychain", brand: "JKU Campus Shop", desc: "Mini graduation cap keychain to celebrate your JKU degree completion", basePrice: 699, attrs: { material: "Metal/Enamel", color: "Black/Gold" } },
  { name: "JKU Desk Flag", brand: "JKU Campus Shop", desc: "JKU Linz desk flag with stand, 15x10cm polyester flag on plastic pole", basePrice: 899, attrs: { size: "15x10cm", material: "Polyester", stand: "Plastic Base" } },
];

// ── Campus Clothing (40) ──────────────────────────────────────────

const clothingBrands = ["Patagonia", "The North Face", "Nike", "Adidas", "H&M", "Zara", "Uniqlo", "Levi's", "Mammut", "Columbia", "Jack Wolfskin", "Carhartt", "Superdry", "Tommy Hilfiger", "Calvin Klein"];

const clothingProducts = [
  { name: "Rain Jacket Campus Edition", brand: "The North Face", desc: "Waterproof rain jacket with taped seams, ideal for cycling to JKU campus", basePrice: 9999, attrs: { material: "DryVent 2L", waterproof: true, hood: true } },
  { name: "Winter Down Jacket Insulated", brand: "Patagonia", desc: "Warm 700-fill down jacket for Linz winter commutes to JKU campus", basePrice: 9999, attrs: { material: "700-Fill Down", waterproof: false, hood: true } },
  { name: "Campus Hoodie Essentials", brand: "Nike", desc: "Classic cotton hoodie for everyday JKU campus wear, comfortable and durable", basePrice: 5999, attrs: { material: "Cotton Fleece", fit: "Regular", color: "Grey" } },
  { name: "Slim Fit Chino Pants", brand: "Uniqlo", desc: "Stretch slim fit chinos, perfect for JKU presentations and everyday wear", basePrice: 3999, attrs: { material: "Cotton Blend", fit: "Slim", color: "Beige" } },
  { name: "Oxford Button-Down Shirt", brand: "Tommy Hilfiger", desc: "Classic Oxford shirt with button-down collar, smart-casual for JKU seminars", basePrice: 7999, attrs: { material: "100% Cotton", fit: "Regular", color: "Blue" } },
  { name: "Merino Wool Sweater", brand: "Uniqlo", desc: "Fine 100% merino wool crew neck sweater, layering essential for JKU winter", basePrice: 4999, attrs: { material: "100% Merino Wool", fit: "Regular", color: "Navy" } },
  { name: "Cargo Joggers", brand: "Adidas", desc: "Comfortable cargo joggers with zip pockets, perfect for JKU sports and lounging", basePrice: 4999, attrs: { material: "Cotton Fleece", fit: "Regular", color: "Black" } },
  { name: "Puffer Vest Insulated", brand: "Jack Wolfskin", desc: "Lightweight insulated vest, perfect for layering during JKU winter semester", basePrice: 6999, attrs: { material: "Synthetic Down", waterproof: false, color: "Black" } },
  { name: "Denim Jacket Classic", brand: "Levi's", desc: "Iconic Levi's trucker jacket, timeless style for JKU campus and beyond", basePrice: 8999, attrs: { material: "Denim", fit: "Regular", color: "Medium Wash" } },
  { name: "Graphic T-Shirt Campus Pack", brand: "Nike", desc: "Soft cotton graphic t-shirt, casual everyday wear for JKU lectures", basePrice: 2999, attrs: { material: "100% Cotton", fit: "Regular", color: "White" } },
  { name: "Polo Shirt Classic Fit", brand: "Fred Perry", desc: "Classic pique polo shirt, smart casual for JKU group presentations", basePrice: 6999, attrs: { material: "Pique Cotton", fit: "Regular", color: "Navy" } },
  { name: "Chino Shorts Campus", brand: "Zara", desc: "Lightweight chino shorts for JKU summer semester and campus barbecues", basePrice: 2999, attrs: { material: "Cotton", fit: "Regular", color: "Khaki" } },
  { name: "Thermal Long Sleeve Base Layer", brand: "Uniqlo", desc: "Heattech thermal top for staying warm during JKU winter lectures", basePrice: 1999, attrs: { material: "HEATTECH", fit: "Slim", color: "Black" } },
  { name: "Winter Parka Extreme", brand: "Mammut", desc: "Heavy-duty winter parka rated to -30°C, essential for the coldest Linz days", basePrice: 9999, attrs: { material: "Gore-Tex + Down", waterproof: true, hood: true } },
  { name: "Casual Sneakers Court", brand: "Nike", desc: "Versatile low-top court sneakers for everyday JKU campus walking", basePrice: 8999, attrs: { type: "Low-Top", material: "Leather/Synthetic", color: "White" } },
  { name: "Trail Running Shoes", brand: "Salomon", desc: "Grippy trail runners for JKU outdoor adventures in the Mühlviertel hills", basePrice: 9999, attrs: { type: "Trail", material: "Mesh/Gore-Tex", waterproof: true, color: "Black/Green" } },
  { name: "Leather Chelsea Boots", brand: "Dr. Martens", desc: "Durable Chelsea boots with air-cushion sole, stylish for JKU campus life", basePrice: 9999, attrs: { type: "Chelsea Boot", material: "Leather", color: "Black" } },
  { name: "Leather Belt Classic", brand: "Calvin Klein", desc: "Genuine leather belt with brushed buckle, smart accessory for JKU presentations", basePrice: 4999, attrs: { material: "Leather", width: "3.5cm", color: "Black" } },
  { name: "Cashmere Blend Scarf", brand: "Uniqlo", desc: "Luxurious cashmere blend scarf for keeping warm between JKU campus buildings", basePrice: 3999, attrs: { material: "Cashmere Blend", size: "170x35cm", color: "Grey" } },
  { name: "Leather Gloves Touchscreen", brand: "Zara", desc: "Touchscreen-compatible leather gloves for JKU winter walks and phone use", basePrice: 2999, attrs: { material: "Leather", touchscreen: true, color: "Black" } },
  { name: "Hiking Boots Waterproof", brand: "Columbia", desc: "Waterproof hiking boots with Omni-Grip, for weekend trips from Linz to the Alps", basePrice: 9999, attrs: { type: "Mid Hiking", material: "Leather/Mesh", waterproof: true, color: "Brown" } },
  { name: "Down Vest Packable", brand: "Uniqlo", desc: "Ultralight down vest that packs into its own pocket, ideal for JKU commuters", basePrice: 3999, attrs: { material: "Down", packable: true, color: "Black" } },
  { name: "Corduroy Pants Slim Fit", brand: "Zara", desc: "Soft corduroy pants in wide wale, trendy for JKU autumn semester", basePrice: 4999, attrs: { material: "Cotton Corduroy", fit: "Slim", color: "Brown" } },
  { name: "Linen Shirt Short Sleeve", brand: "Zara", desc: "Breathable linen short sleeve shirt for JKU summer exam period", basePrice: 3499, attrs: { material: "100% Linen", fit: "Regular", color: "White" } },
  { name: "Tracksuit Set Training", brand: "Adidas", desc: "Classic 3-stripe tracksuit for JKU sports and casual campus days", basePrice: 7999, attrs: { material: "Polyester Doubleknit", fit: "Regular", color: "Navy" } },
  { name: "Rain Pants Over-Trousers", brand: "Mammut", desc: "Lightweight waterproof over-trousers for cycling to JKU in the rain", basePrice: 5999, attrs: { material: "Nylon 2L", waterproof: true, packable: true } },
  { name: "Summer Dress Casual", brand: "H&M", desc: "Lightweight sleeveless summer dress, perfect for warm JKU campus days", basePrice: 2999, attrs: { material: "Cotton/Viscose", length: "Knee", color: "Floral" } },
  { name: "Cardigan Wool Blend", brand: "Uniqlo", desc: "Soft wool blend cardigan with buttons, cozy for JKU library study sessions", basePrice: 4499, attrs: { material: "Wool Blend", fit: "Regular", color: "Camel" } },
  { name: "Trench Coat Mid-Length", brand: "Zara", desc: "Classic double-breasted trench coat, smart outerwear for JKU spring semester", basePrice: 9999, attrs: { material: "Cotton Gabardine", waterproof: true, length: "Mid" } },
  { name: "Fleece Jacket Half-Zip", brand: "Patagonia", desc: "Classic half-zip fleece, Patagonia's Synchilla fabric for warmth on JKU campus", basePrice: 8999, attrs: { material: "Synchilla Fleece", fit: "Regular", color: "Navy" } },
  { name: "Wool Trousers Tailored", brand: "Zara", desc: "Tailored wool-blend trousers for JKU job fairs and internship interviews", basePrice: 7999, attrs: { material: "Wool Blend", fit: "Tailored", color: "Charcoal" } },
  { name: "Vest Down Lightweight", brand: "Uniqlo", desc: "Ultra-lightweight down vest with 750-fill power, packable for JKU travel", basePrice: 4999, attrs: { material: "750-Fill Down", packable: true, color: "Navy" } },
  { name: "Pullover Hoodie Heavyweight", brand: "Carhartt", desc: "Durable heavyweight hoodie, built to last through multiple JKU semesters", basePrice: 6999, attrs: { material: "12oz Cotton Fleece", fit: "Relaxed", color: "Black" } },
  { name: "Bomber Jacket Nylon", brand: "Zara", desc: "Classic bomber jacket in shiny nylon, casual cool for JKU campus life", basePrice: 6999, attrs: { material: "Nylon", fit: "Regular", color: "Olive" } },
  { name: "Sport Leggings High-Waist", brand: "Nike", desc: "High-waist Dri-FIT leggings for JKU sports centre workouts", basePrice: 5999, attrs: { material: "Dri-FIT Polyester", fit: "Compression", color: "Black" } },
  { name: "Canvas Belt Herringbone", brand: "Uniqlo", desc: "Cloth herringbone belt with leather tip, casual accent for JKU denim", basePrice: 1999, attrs: { material: "Canvas/Leather", color: "Navy" } },
  { name: "Slippers House Shoes", brand: "Nike", desc: "Comfortable fleece-lined house slippers for JKU dorm room relaxation", basePrice: 3499, attrs: { material: "Fleece/Rubber", color: "Grey" } },
  { name: "Beanie Cuffed Wool", brand: "The North Face", desc: "Cuffed beanie with TNF logo, warm headwear for JKU winter commutes", basePrice: 2499, attrs: { material: "Acrylic/Wool", color: "Black" } },
  { name: "Belt Bag Fanny Pack", brand: "Nike", desc: "Hands-free belt bag for carrying JKU ID, phone and keys around campus", basePrice: 2999, attrs: { material: "Polyester", capacity: "1L", color: "Black" } },
  { name: "UV Protection Sun Hat", brand: "Columbia", desc: "Wide-brim sun hat with UPF 50, useful for JKU outdoor events and summer sports", basePrice: 2499, attrs: { material: "Polyester", UPF: 50, color: "Khaki" } },
];

// ── Software & Subscriptions (25) ─────────────────────────────────

const softwareProducts = [
  { name: "Microsoft Office 365 Student 1-Year", brand: "Microsoft", desc: "Word, Excel, PowerPoint, OneNote and 1TB OneDrive — 1-year student subscription", basePrice: 7999, attrs: { type: "Subscription", duration: "1 Year", licenses: 1, includes: "Office Apps + 1TB OneDrive" } },
  { name: "JetBrains All Products Pack Student", brand: "JetBrains", desc: "All JetBrains IDEs — IntelliJ IDEA, PyCharm, WebStorm, CLion and more — free 1-year student license", basePrice: 0, attrs: { type: "Student License", duration: "1 Year", products: "All JetBrains IDEs", renew: "Free renewal" } },
  { name: "Adobe Creative Cloud Student 1-Year", brand: "Adobe", desc: "Photoshop, Illustrator, Premiere Pro, After Effects and 20+ apps — discounted JKU student rate", basePrice: 29999, attrs: { type: "Subscription", duration: "1 Year", includes: "20+ Apps", storage: "100GB" } },
  { name: "GitHub Student Developer Pack", brand: "GitHub", desc: "Free GitHub Pro, Copilot, and partner offers for JKU students — claim via JKU email", basePrice: 0, attrs: { type: "Free Student Pack", includes: "GitHub Pro + Copilot + Partner Offers" } },
  { name: "MATLAB & Simulink Student Suite", brand: "MathWorks", desc: "MATLAB, Simulink and 10+ add-on products for JKU engineering and mathematics students", basePrice: 4999, attrs: { type: "Perpetual", duration: "Lifetime Student", includes: "MATLAB + Simulink + 10 Add-ons" } },
  { name: "AutoCAD Student 1-Year", brand: "Autodesk", desc: "Professional CAD software for JKU engineering and architecture students", basePrice: 0, attrs: { type: "Student License", duration: "1 Year", includes: "AutoCAD Full" } },
  { name: "Parallels Desktop 20 Student", brand: "Parallels", desc: "Run Windows on Mac for JKU courses requiring Visual Studio or Windows-only software", basePrice: 5999, attrs: { type: "Perpetual", platforms: "Mac", includes: "Windows VM", version: "20" } },
  { name: "VMware Fusion Pro Student", brand: "VMware", desc: "Virtualization software for JKU students running multiple OS on their machine", basePrice: 3999, attrs: { type: "Perpetual", platforms: "Mac", version: "13 Pro" } },
  { name: "NordVPN Student 2-Year", brand: "NordVPN", desc: "Secure VPN for JKU eduroam and safe browsing on public campus WiFi", basePrice: 5999, attrs: { type: "Subscription", duration: "2 Years", devices: 6, includes: "VPN + Threat Protection" } },
  { name: "1Password Families 1-Year", brand: "1Password", desc: "Password manager for your JKU accounts and shared family passwords", basePrice: 4799, attrs: { type: "Subscription", duration: "1 Year", family_members: 5, platforms: "All" } },
  { name: "Notion Plus Student 1-Year", brand: "Notion", desc: "Upgraded Notion with unlimited file uploads and AI features for JKU study organization", basePrice: 5999, attrs: { type: "Subscription", duration: "1 Year", includes: "Unlimited Uploads + AI" } },
  { name: "Obsidian Sync 1-Year", brand: "Obsidian", desc: "Sync your JKU lecture notes across devices with end-to-end encryption", basePrice: 4799, attrs: { type: "Subscription", duration: "1 Year", storage: "10GB", encryption: "E2E" } },
  { name: "Tableau Desktop Student 1-Year", brand: "Salesforce", desc: "Data visualization software for JKU data science and business analytics courses", basePrice: 0, attrs: { type: "Student License", duration: "1 Year", includes: "Tableau Desktop + Prep" } },
  { name: "SolidWorks Student Edition", brand: "Dassault", desc: "3D CAD software for JKU mechanical engineering and product design students", basePrice: 9999, attrs: { type: "Student License", duration: "1 Year", includes: "SolidWorks Premium" } },
  { name: "DaVinci Resolve Studio", brand: "Blackmagic Design", desc: "Professional video editing and color grading for JKU media informatics students", basePrice: 29500, attrs: { type: "Perpetual", includes: "Edit + Color + Fusion + Fairlight" } },
  { name: "EndNote 21 Student", brand: "Clarivate", desc: "Reference management tool for JKU thesis writing and academic research", basePrice: 3999, attrs: { type: "Perpetual", includes: "Reference Manager + Cite While You Write" } },
  { name: "SPSS Statistics Student", brand: "IBM", desc: "Statistical analysis software for JKU social sciences and business statistics courses", basePrice: 4999, attrs: { type: "Student License", duration: "1 Year", includes: "SPSS Statistics Base" } },
  { name: "FL Studio Producer Edition", brand: "Image-Line", desc: "Digital audio workstation for JKU music technology and media students", basePrice: 19900, attrs: { type: "Perpetual", includes: "Producer Edition + Lifetime Updates" } },
  { name: "iMovie / Final Cut Pro Education Bundle", brand: "Apple", desc: "Professional video editing for JKU media projects — educational pricing", basePrice: 29999, attrs: { type: "Perpetual", platform: "Mac", includes: "Final Cut Pro + Motion + Compressor" } },
  { name: "Logic Pro for Mac Student", brand: "Apple", desc: "Professional music production for JKU digital media students — educational pricing", basePrice: 19999, attrs: { type: "Perpetual", platform: "Mac", includes: "Logic Pro + Sound Library" } },
  { name: "VS Code Copilot Subscription 1-Year", brand: "Microsoft", desc: "GitHub Copilot in VS Code — AI pair programming for JKU coding assignments", basePrice: 9999, attrs: { type: "Subscription", duration: "1 Year", includes: "GitHub Copilot in IDE", platforms: "VS Code, JetBrains" } },
  { name: "Minecraft Education Edition 1-Year", brand: "Microsoft", desc: "Minecraft Education for JKU computer science education and creative projects", basePrice: 1499, attrs: { type: "Subscription", duration: "1 Year", includes: "Minecraft Education + Lessons" } },
  { name: "Wolfram Mathematica Student", brand: "Wolfram", desc: "Computational intelligence for JKU mathematics and physics students", basePrice: 4999, attrs: { type: "Student License", duration: "1 Year", includes: "Mathematica + Wolfram|Alpha Pro" } },
  { name: "iZotope Music Production Suite", brand: "iZotope", desc: "Audio production and mastering tools for JKU music technology students", basePrice: 19999, attrs: { type: "Perpetual", includes: "Ozone + RX + Neutron + Nectar", platform: "Win/Mac" } },
  { name: "Bitwig Studio 16-Track", brand: "Bitwig", desc: "Modern digital audio workstation for JKU electronic music and media projects", basePrice: 7999, attrs: { type: "Perpetual", tracks: 16, platform: "Win/Mac/Linux" } },
];

// ── Campus Accessories (30) ───────────────────────────────────────

const accessoryBrands = ["Herschel", "Fjällräven", "Deuter", "North Face", "Bellroy", "Nike", "Adidas", "Thule", "Ortlieb", "Patagonia", "CamelBak", "Hydro Flask", "Nalgene", "Native Union", "DJB"];

const accessoryProducts = [
  { name: "Campus Backpack Waterproof 30L", brand: "Herschel", desc: "Classic waterproof backpack with padded laptop compartment — carry your JKU gear", basePrice: 7999, attrs: { capacity: "30L", laptop: "15.6\"", waterproof: true, color: "Black" } },
  { name: "Kanken Laptop Backpack 15\"", brand: "Fjällräven", desc: "Iconic Swedish backpack with padded laptop sleeve, popular on JKU campus", basePrice: 9999, attrs: { capacity: "16L", laptop: "15\"", material: "Vinylon F", color: "Navy" } },
  { name: "Deuter Giga Bike Backpack 28L", brand: "Deuter", desc: "Ergonomic bike backpack with Airstripes back system for JKU cyclists", basePrice: 8999, attrs: { capacity: "28L", laptop: "15.6\"", bike: true, waterproof: false, color: "Black/Green" } },
  { name: "Thule Subterra Backpack 23L", brand: "Thule", desc: "Sleek 23L everyday backpack with SafeZone compartment for JKU valuables", basePrice: 9499, attrs: { capacity: "23L", laptop: "15\"", material: "Nylon", color: "Black" } },
  { name: "Ortlieb Urban Classic Waterproof Backpack", brand: "Ortlieb", desc: "Fully waterproof roll-top backpack, essential for rainy JKU commutes", basePrice: 13999, attrs: { capacity: "24L", material: "PU-Nylon", waterproof: true, color: "Black" } },
  { name: "Hydro Flask Water Bottle 32oz", brand: "Hydro Flask", desc: "Double-wall vacuum insulated bottle, keeps drinks cold for JKU lectures", basePrice: 3999, attrs: { capacity: "950ml", material: "Stainless Steel", insulated: true, color: "White" } },
  { name: "Nalgene Wide Mouth 1L", brand: "Nalgene", desc: "BPA-free Tritan water bottle, the classic JKU dorm room essential", basePrice: 1499, attrs: { capacity: "1L", material: "Tritan", BPA_free: true, color: "Transparent" } },
  { name: "Umbrella Windproof Auto-Open", brand: "DJB", desc: "Reinforced windproof umbrella with Teflon-coated canopy for Linz weather", basePrice: 2999, attrs: { type: "Windproof Auto-Open", canopy: "110cm", color: "Black" } },
  { name: "Bike Light Set USB Rechargeable", brand: "Knog", desc: "Bright USB-C rechargeable front + rear bike light set for JKU evening commutes", basePrice: 3499, attrs: { type: "LED Set", power: "200lm Front / 50lm Rear", rechargeable: true, waterproof: true } },
  { name: "Lunch Box Stainless Steel 3-Compartment", brand: "ECOSUS", desc: "Leak-proof stainless steel bento lunch box with 3 compartments for JKU Mensa alternatives", basePrice: 2999, attrs: { material: "Stainless Steel", compartments: 3, leakproof: true, capacity: "1.2L" } },
  { name: "Phone Case Anti-Shock Universal", brand: "Spigen", desc: "Military-grade shockproof phone case with kickstand, for popular phone models", basePrice: 1999, attrs: { protection: "Military Grade", features: "Kickstand + Air Cushion", material: "TPU+PC" } },
  { name: "Power Strip USB-C 6-Outlet", brand: "Anker", desc: "Surge-protected 6-outlet power strip with 2 USB-C ports for JKU dorm desks", basePrice: 2999, attrs: { outlets: 6, usb_ports: 2, type_c: true, surge: true } },
  { name: "Desk Organizer Mesh Black", brand: "Amazon Basics", desc: "Multi-compartment mesh desk organizer for pens, sticky notes and JKU paperwork", basePrice: 1799, attrs: { material: "Metal Mesh", compartments: 5, color: "Black" } },
  { name: "Ethernet Cable Cat6 10m", brand: "Amazon Basics", desc: "High-speed Cat6 Ethernet cable for stable JKU dorm room internet connection", basePrice: 999, attrs: { length: "10m", category: "Cat6", speed: "1Gbps", color: "Blue" } },
  { name: "Surge Protector Power Strip 8-Outlet", brand: "Belkin", desc: "Professional surge protector for JKU workstation — protects laptop, monitor and peripherals", basePrice: 3499, attrs: { outlets: 8, surge: true, usb: true, cable: "2m" } },
  { name: "Laptop Sleeve Neoprene 15.6\"", brand: "Amazon Basics", desc: "Padded neoprene laptop sleeve with zip closure, protects your JKU laptop in your backpack", basePrice: 1299, attrs: { size: "15.6\"", material: "Neoprene", color: "Black" } },
  { name: "Monitor Stand Riser Adjustable", brand: "Vivo", desc: "Adjustable monitor stand with USB hub, improves ergonomics for JKU desk setup", basePrice: 2999, attrs: { material: "Steel/Plastic", height: "Adjustable 4-6\"", usb: true, color: "Black" } },
  { name: "Cable Management Box", brand: "BlueRigger", desc: "Hide power strips and cables in this sleek box — tidy up your JKU study space", basePrice: 1999, attrs: { size: "30x13x13cm", material: "ABS Plastic", color: "Black" } },
  { name: "Sticky Notes Dispenser", brand: "3M", desc: "Post-it Pop-up dispenser with 500 sheets for quick JKU lecture reminders", basePrice: 899, attrs: { sheets: 500, color: "Assorted Yellow/Green/Pink", size: "76x76mm" } },
  { name: "Reading Pillow Backrest", brand: "ComfortSit", desc: "Adjustable reading pillow with armrests and pocket for bed studying in your JKU dorm", basePrice: 3999, attrs: { material: "Memory Foam + Microsuede", color: "Grey", features: "Armrests + Side Pocket" } },
  { name: "Eye Mask Silk Sleep", brand: "Slip", desc: "Pure silk sleep mask for napping between JKU lectures in the dorm", basePrice: 2499, attrs: { material: "100% Mulberry Silk", color: "Black", adjustable: true } },
  { name: "Whiteboard Markers Set 8 Colors", brand: "Expo", desc: "Low-odor dry erase markers, 8 vivid colors for JKU group project whiteboard sessions", basePrice: 899, attrs: { packSize: 8, type: "Low-Odor", colors: "Assorted", tip: "Fine" } },
  { name: "USB Desk Fan Silent", brand: "Lasko", desc: "Quiet USB desk fan with adjustable head, essential for warm JKU lecture halls", basePrice: 1999, attrs: { type: "USB Desk Fan", speed: "3 Levels", noise: "Low", tilt: "Adjustable" } },
  { name: "Laptop Lock Key Combo", brand: "Kensington", desc: "Kensington-style combo lock to secure your laptop at JKU library and study areas", basePrice: 2499, attrs: { type: "Key/Combo Hybrid", cable: "1.8m", compatible: "Kensington Slot" } },
  { name: "Passport Holder RFID Blocking", brand: "Bellroy", desc: "Slim RFID-blocking passport holder for JKU students planning study abroad semesters", basePrice: 4999, attrs: { material: "Leather", RFID: true, color: "Navy" } },
  { name: "Travel Mug Insulated 350ml", brand: "Contigo", desc: "Spill-proof travel mug with thermal insulation, coffee stays hot through JKU lectures", basePrice: 1999, attrs: { capacity: "350ml", material: "Stainless Steel", lid: "SnapSeal Leak-Proof", color: "Black" } },
  { name: "Anti-Fatigue Mat Kitchen/Desk", brand: "Gorilla Grip", desc: "Comfort mat for standing desk sessions during long JKU coding sessions", basePrice: 2999, attrs: { size: "60x90cm", material: "Foam/Rubber", thickness: "1.5cm", color: "Black" } },
  { name: "Bicycle Pannier Waterproof Set", brand: "Ortlieb", desc: "Waterproof bike pannier set for JKU students who bike to campus in any weather", basePrice: 9999, attrs: { type: "Set (2 Panniers)", capacity: "20L each", waterproof: true, attachment: "QL2.1" } },
  { name: "Phone Wall Mount Bed", brand: "BESIGN", desc: "Articulating phone mount that attaches to your bed frame for JKU dorm Netflix", basePrice: 1499, attrs: { type: "Bed Mount", compatible: "All Phones", rotation: "360°" } },
  { name: "Vortex Keychain Multitool", brand: "SOG", desc: "Compact keychain multitool with 6 functions — handy for JKU dorm quick fixes", basePrice: 1999, attrs: { functions: 6, material: "Stainless Steel", length: "5.5cm", color: "Silver" } },
  { name: "Anker Power Bank 20000mAh", brand: "Anker", desc: "High-capacity 20000mAh power bank with USB-C PD, charge your devices all day at JKU", basePrice: 4999, attrs: { capacity: "20000mAh", ports: "USB-C PD + USB-A", fastCharge: true, color: "Black" }, tags: ["student", "durable", "travel"] },
  { name: "Anker USB-C Hub 7-in-1", brand: "Anker", desc: "Compact USB-C hub with HDMI 4K, SD card reader, and 100W PD passthrough for JKU laptops", basePrice: 5499, attrs: { ports: "HDMI/SD/microSD/USB-A x3/USB-C PD", color: "Space Gray" }, tags: ["student", "professional"] },
  { name: "Satechi Aluminum Monitor Stand", brand: "Satechi", desc: "Elegant aluminum monitor stand with USB-C hub, declutter your JKU dorm desk", basePrice: 5999, attrs: { material: "Aluminum", ports: "USB-C x3", color: "Space Gray" }, tags: ["student", "premium"] },
  { name: "Google Chromecast with Google TV 4K", brand: "Google", desc: "Stream JKU lecture recordings and Netflix in 4K HDR on your dorm TV", basePrice: 5999, attrs: { resolution: "4K HDR", remote: "Voice Remote", os: "Google TV", connectivity: "HDMI" }, tags: ["student", "home"] },
  { name: "Anker USB-C Cable 2m Braided", brand: "Anker", desc: "Durable braided USB-C to C cable with 100W PD charging for your JKU laptop and phone", basePrice: 1499, attrs: { length: "2m", charging: "100W", data: "10Gbps", color: "Black" }, tags: ["student", "durable"] },
];

// ── Build products from data ──────────────────────────────────────

function typedProduct(p, catId, tagPool) {
  return {
    id: uid("prd"),
    categoryId: catId,
    name: p.name,
    description: p.desc,
    brand: p.brand,
    tags: [...new Set([...randomTags(tagPool), ...(p.tags || [])])],
    attributes: p.attrs,
    variants: [],
  };
}

function categoryFromTemplateList(products, catId, variantConfigsFn, tagPool) {
  return products.map((p) => {
    const prod = typedProduct(p, catId, tagPool);
    const configs = variantConfigsFn(p);
    prod.variants = configs.map((cfg) => ({
      id: uid("var"),
      sku: `${p.brand.slice(0, 3).toUpperCase()}-${p.name.replace(/[\s,']/g, "").slice(0, 10)}-${cfg.skuSuffix || cfg.name}`,
      name: cfg.name || "",
      attributes: cfg.attrs || {},
      offers: generateOffers(cfg.basePrice),
    }));
    return prod;
  });
}

function laptopVariantConfigs(basePrice, configPool) {
  const selected = configPool.slice(0, randInt(2, 4));
  return selected.map((cfg) => ({
    ...cfg,
    basePrice: basePrice + (cfg.attrs.ram * 1500) + (/2TB/.test(cfg.attrs.storage) ? 15000 : /1TB/.test(cfg.attrs.storage) ? 8000 : /512/.test(cfg.attrs.storage) ? 4000 : 2000),
  }));
}

function clothingVariantConfigs(basePrice, _catId, gender) {
  const sizePool = gender === "male" ? MALE_SIZES : gender === "female" ? FEMALE_SIZES : UNISEX_SIZES;
  const colors = ["Black", "White", "Navy", "Grey", "Khaki"];
  const selectedSizes = sizePool.slice(0, randInt(3, 5));
  const selectedColors = colors.slice(0, randInt(2, 4));
  const count = randInt(3, Math.min(selectedSizes.length * selectedColors.length, 6));
  const result = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let size, color;
    do { size = pick(selectedSizes); color = pick(selectedColors); } while (used.has(`${size}-${color}`));
    used.add(`${size}-${color}`);
    const extra = (size === "XL" || size === "XXL") ? 500 : 0;
    result.push({ name: `${size} / ${color}`, attrs: { size, color, gender }, basePrice: basePrice + extra, skuSuffix: `${size}-${color}` });
  }
  return result;
}

function jkuMerchVariantConfigs(basePrice) {
  const sizes = ["S", "M", "L", "XL", "XXL"];
  const count = randInt(3, 5);
  const result = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let size;
    do { size = pick(sizes); } while (used.has(size));
    used.add(size);
    const extra = (size === "XL" || size === "XXL") ? 500 : 0;
    result.push({ name: size, attrs: { size }, basePrice: basePrice + extra, skuSuffix: size });
  }
  return result;
}

function textbookVariantConfigs(basePrice) {
  const formats = ["Paperback", "Hardcover"];
  const selected = formats.slice(0, randInt(1, 2));
  return selected.map((fmt) => ({
    name: fmt,
    attrs: { format: fmt },
    basePrice: fmt === "Hardcover" ? basePrice + 2000 : basePrice,
    skuSuffix: fmt,
  }));
}

function softwareVariantConfigs(basePrice) {
  const durations = ["1 Year", "2 Year", "Perpetual"];
  if (basePrice === 0) {
    return [{ name: "Free Student License", attrs: { duration: "1 Year" }, basePrice: 0, skuSuffix: "free" }];
  }
  const selected = durations.slice(0, randInt(1, durations.length));
  return selected.map((d) => ({
    name: d,
    attrs: { duration: d },
    basePrice: d === "2 Year" ? basePrice * 1.8 : d === "Perpetual" ? basePrice * 2.5 : basePrice,
    skuSuffix: d.replace(/\s/g, ""),
  }));
}

function accessoryVariantConfigs(basePrice) {
  const colors = ["Black", "White", "Navy", "Grey", "Green"];
  const selected = colors.slice(0, randInt(2, 4));
  return selected.map((color) => ({
    name: color,
    attrs: { color },
    basePrice: basePrice + (color === "Navy" ? 500 : 0),
    skuSuffix: color,
  }));
}

function countFromData(arr) {
  return arr.map((p) => [p, 1]);
}

function generateCategory(products, catId, variantFn, tagPool) {
  return products.map((p) => {
    const prod = {
      id: uid("prd"),
      categoryId: catId,
      name: p.name,
      description: p.desc,
      brand: p.brand,
      tags: [...new Set([...randomTags(tagPool), ...(p.tags || [])])],
      attributes: p.attrs,
      variants: [],
    };
    prod.variants = variantFn(p.basePrice, catId).map((cfg) => ({
      id: uid("var"),
      sku: `${p.brand.slice(0, 3).toUpperCase()}-${p.name.replace(/[\s,']/g, "").slice(0, 10)}-${cfg.skuSuffix || cfg.name}`,
      name: cfg.name || "",
      attributes: cfg.attrs || {},
      offers: generateOffers(cfg.basePrice),
    }));
    return prod;
  });
}

// ── Assemble all products ─────────────────────────────────────────

function buildAllProducts() {
  const allProducts = [];

  // Electronics & Gadgets (laptop-like configs)
  for (const p of electronicsProducts) {
    const prod = {
      id: uid("prd"),
      categoryId: electronicsCatId,
      name: p.name,
      description: p.desc,
      brand: p.brand,
      tags: [...new Set([...randomTags(), ...(p.tags || [])])],
      attributes: p.attrs,
      variants: [],
    };
    const selected = laptopConfigs.slice(0, randInt(2, 4));
    for (const cfg of selected) {
      const vPrice = p.basePrice + (cfg.attrs.ram * 1500) + (/2TB/.test(cfg.attrs.storage) ? 15000 : /1TB/.test(cfg.attrs.storage) ? 8000 : /512/.test(cfg.attrs.storage) ? 4000 : 2000);
      prod.variants.push({
        id: uid("var"),
        sku: `${p.brand.slice(0, 3).toUpperCase()}-${p.name.replace(/[\s,']/g, "").slice(0, 10)}-${cfg.attrs.ram}G-${cfg.attrs.storage.replace(/[^a-zA-Z0-9]/g, "")}`,
        name: cfg.name,
        attributes: cfg.attrs,
        offers: generateOffers(vPrice),
      });
    }
    allProducts.push(prod);
  }

  // Textbooks & Stationery
  for (const p of textbookProducts) {
    const prod = {
      id: uid("prd"),
      categoryId: textbooksCatId,
      name: p.name,
      description: p.desc,
      brand: p.brand || "Various",
      tags: [...new Set([...randomTags(), ...(p.tags || [])])],
      attributes: p.attrs,
      variants: [],
    };
    const formats = ["Paperback", "Hardcover"].slice(0, randInt(1, 2));
    for (const fmt of formats) {
      const vPrice = fmt === "Hardcover" ? p.basePrice + 2000 : p.basePrice;
      prod.variants.push({
        id: uid("var"),
        sku: `${(p.brand || "PUB").slice(0, 3).toUpperCase()}-${p.name.replace(/[\s,':]/g, "").slice(0, 10)}-${fmt.slice(0, 4)}`,
        name: fmt,
        attributes: { format: fmt },
        offers: generateOffers(vPrice),
      });
    }
    allProducts.push(prod);
  }

  // JKU Merchandise & Apparel
  for (const p of jkuMerchProducts) {
    const prod = {
      id: uid("prd"),
      categoryId: jkuMerchCatId,
      name: p.name,
      description: p.desc,
      brand: p.brand,
      tags: [...new Set([...randomTags(), ...(p.tags || [])])],
      attributes: p.attrs,
      variants: [],
    };
    const sizes = ["S", "M", "L", "XL", "XXL"].slice(0, randInt(3, 5));
    for (const size of sizes) {
      const extra = (size === "XL" || size === "XXL") ? 500 : 0;
      prod.variants.push({
        id: uid("var"),
        sku: `JKU-${p.name.replace(/[\s,']/g, "").slice(0, 12)}-${size}`,
        name: size,
        attributes: { size },
        offers: generateOffers(p.basePrice + extra),
      });
    }
    allProducts.push(prod);
  }

  // Campus Clothing
  for (const p of clothingProducts) {
    const gender = pickGender();
    let name = p.name;
    const baseName = name
      .replace(/^(Men's |Women's )/, "");
    if (gender === "male") name = `Men's ${baseName}`;
    else if (gender === "female") name = `Women's ${baseName}`;
    else name = baseName;

    const prod = {
      id: uid("prd"),
      categoryId: clothingCatId,
      name,
      description: p.desc,
      brand: p.brand,
      tags: [...new Set([...randomTags(), ...(p.tags || [])])],
      attributes: { ...p.attrs, gender },
      variants: [],
    };
    const shoeNames = new Set(["Casual Sneakers Court", "Trail Running Shoes", "Leather Chelsea Boots", "Hiking Boots Waterproof"]);
    if (shoeNames.has(p.name)) {
      const euSizes = SHOE_SIZES.slice(0, randInt(4, 7));
      for (const euSize of euSizes) {
        const extra = (euSize > 43) ? 500 : 0;
        prod.variants.push({
          id: uid("var"),
          sku: `${p.brand.slice(0, 3).toUpperCase()}-${baseName.replace(/[\s,']/g, "").slice(0, 10)}-EU${euSize}`,
          name: `EU ${euSize}`,
          attributes: { size: euSize, color: p.attrs.color || "Black", gender },
          offers: generateOffers(p.basePrice + extra),
        });
      }
    } else {
      const sizePool = gender === "male" ? MALE_SIZES : gender === "female" ? FEMALE_SIZES : UNISEX_SIZES;
      const sizes = sizePool.slice(0, randInt(3, 5));
      const colors = p.attrs.color ? [p.attrs.color] : ["Black", "White", "Navy"];
      const vCount = randInt(3, Math.min(sizes.length * colors.length, 6));
      const usedPairs = new Set();
      for (let i = 0; i < vCount; i++) {
        let size, color;
        do { size = pick(sizes); color = pick(colors); } while (usedPairs.has(`${size}-${color}`));
        usedPairs.add(`${size}-${color}`);
        const extra = (size === "XL" || size === "XXL") ? 500 : 0;
        prod.variants.push({
          id: uid("var"),
          sku: `${p.brand.slice(0, 3).toUpperCase()}-${baseName.replace(/[\s,']/g, "").slice(0, 10)}-${size}-${color}`,
          name: `${size} / ${color}`,
          attributes: { size, color, gender },
          offers: generateOffers(p.basePrice + extra),
        });
      }
    }
    allProducts.push(prod);
  }

  // Software & Subscriptions
  for (const p of softwareProducts) {
    const prod = {
      id: uid("prd"),
      categoryId: softwareCatId,
      name: p.name,
      description: p.desc,
      brand: p.brand,
      tags: [...new Set([...randomTags(), ...(p.tags || [])])],
      attributes: p.attrs,
      variants: [],
    };
    if (p.basePrice === 0) {
      prod.variants.push({
        id: uid("var"),
        sku: `${p.brand.slice(0, 3).toUpperCase()}-${p.name.replace(/[\s,':]/g, "").slice(0, 10)}-FREE`,
        name: "Free Student License",
        attributes: { duration: "1 Year", price_type: "Free" },
        offers: generateOffers(0, 1, 2),
      });
    } else {
      const durs = ["1 Year", "2 Year", "Perpetual"].slice(0, randInt(1, 3));
      for (const dur of durs) {
        const vPrice = dur === "2 Year" ? Math.round(p.basePrice * 1.8) : dur === "Perpetual" ? Math.round(p.basePrice * 2.5) : p.basePrice;
        prod.variants.push({
          id: uid("var"),
          sku: `${p.brand.slice(0, 3).toUpperCase()}-${p.name.replace(/[\s,':]/g, "").slice(0, 10)}-${dur.replace(/\s/g, "")}`,
          name: dur,
          attributes: { duration: dur },
          offers: generateOffers(vPrice),
        });
      }
    }
    allProducts.push(prod);
  }

  // Campus Accessories
  for (const p of accessoryProducts) {
    const colors = ["Black", "White", "Navy", "Grey", "Green"].slice(0, randInt(2, 4));
    const prod = {
      id: uid("prd"),
      categoryId: accessoriesCatId,
      name: p.name,
      description: p.desc,
      brand: p.brand,
      tags: [...new Set([...randomTags(), ...(p.tags || [])])],
      attributes: p.attrs,
      variants: [],
    };
    for (const color of colors) {
      const vPrice = p.basePrice + (color === "Navy" ? 500 : 0);
      prod.variants.push({
        id: uid("var"),
        sku: `${p.brand.slice(0, 3).toUpperCase()}-${p.name.replace(/[\s,':]/g, "").slice(0, 10)}-${color}`,
        name: color,
        attributes: { color },
        offers: generateOffers(vPrice),
      });
    }
    allProducts.push(prod);
  }

  return allProducts;
}

// ── Add starter-set tag ───────────────────────────────────────────

function addStarterSetTags(products) {
  // Pick ~12 products across outfit / JKU merch / electronics / textbooks / accessories
  const starterSetNames = [
    "JKU Hoodie Premium",
    "JKU T-Shirt Classic",
    "JKU Tote Bag Canvas",
    "JKU Coffee Mug Ceramic",
    "JKU Water Bottle Stainless",
    "ThinkPad X1 Carbon Student Edition",
    "MacBook Air M3 Student Bundle",
    "Introduction to Algorithms (CLRS)",
    "Calculus: Early Transcendentals",
    "Campus Backpack Waterproof 30L",
    "Rain Jacket Campus Edition",
    "Campus Hoodie Essentials",
  ];
  for (const prod of products) {
    if (starterSetNames.some(s => prod.name.endsWith(s))) {
      prod.tags = [...new Set([...prod.tags, "starter-set"])];
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────

function main() {
  const products = buildAllProducts();
  addStarterSetTags(products);

  const dataset = { categories, products, vendors, warehouses, vouchers };
  writeFileSync("data/dataset.json", JSON.stringify(dataset, null, 2));

  let variantCount = 0;
  let offerCount = 0;
  for (const p of products) {
    variantCount += p.variants.length;
    for (const v of p.variants) {
      offerCount += v.offers.length;
    }
  }

  const freeOffers = products.flatMap(p => p.variants.flatMap(v => v.offers)).filter(o => o.shippingCost === 0).length;
  const paidOffers = products.flatMap(p => p.variants.flatMap(v => v.offers)).filter(o => o.shippingCost > 0).length;
  console.log(`Generated ${products.length} products`);
  console.log(`  ${variantCount} variants`);
  console.log(`  ${offerCount} offers`);
  console.log(`  free shipping: ${freeOffers} (${(freeOffers / (freeOffers + paidOffers) * 100).toFixed(1)}%)`);
  console.log(`  paid shipping: ${paidOffers} (${(paidOffers / (freeOffers + paidOffers) * 100).toFixed(1)}%)`);
  const starterSetProducts = products.filter(p => p.tags.includes("starter-set"));
  console.log(`  starter-set products: ${starterSetProducts.length}`);
}

main();
