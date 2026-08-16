import fs from 'fs';
import path from 'path';

const testFile = path.resolve('./packages/local-db/tests/catalog-cache.test.ts');
let content = fs.readFileSync(testFile, 'utf8');

// Fix readonly property assignments
content = content.replace(/snap\.product_units\[0\]!\.conversion_factor = "6\.50000000";/g, '(snap.product_units[0]! as any).conversion_factor = "6.50000000";');
content = content.replace(/snap2\.products\[0\]!\.name = "Mutated name";/g, '(snap2.products[0]! as any).name = "Mutated name";');
content = content.replace(/snap\.barcodes\[0\]!\.barcode = "000555";/g, '(snap.barcodes[0]! as any).barcode = "000555";');
content = content.replace(/snap\.product_units\[0\]!\.conversion_factor = "1\.5000";/g, '(snap.product_units[0]! as any).conversion_factor = "1.5000";');

fs.writeFileSync(testFile, content);
console.log('Fixed TS errors in tests');
