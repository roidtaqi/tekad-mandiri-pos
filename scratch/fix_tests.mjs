import fs from 'fs';
import path from 'path';

const testFile = path.resolve('./packages/local-db/tests/catalog-cache.test.ts');
let content = fs.readFileSync(testFile, 'utf8');

// Replace createPosLocalDatabase with _createPosLocalDatabaseInternal
content = content.replace(/createPosLocalDatabase\(/g, '_createPosLocalDatabaseInternal(');

// Add non-null assertions to array lookups
content = content.replace(/products\[0\]\./g, 'products[0]!.');
content = content.replace(/productsA\[0\]\./g, 'productsA[0]!.');
content = content.replace(/productsB\[0\]\./g, 'productsB[0]!.');
content = content.replace(/units\[0\]\./g, 'units[0]!.');
content = content.replace(/barcodes\[0\]\./g, 'barcodes[0]!.');
content = content.replace(/barcodesA\[0\]\./g, 'barcodesA[0]!.');
content = content.replace(/barcodesB\[0\]\./g, 'barcodesB[0]!.');
content = content.replace(/subsequentProducts\[0\]\./g, 'subsequentProducts[0]!.');

// Fix readonly property assignments
content = content.replace(/snap\.product_units\[0\]\.conversion_factor = "6.50000000";/g, '(snap.product_units[0] as any).conversion_factor = "6.50000000";');
content = content.replace(/snap2\.products\[0\]\.name = "Mutated name";/g, '(snap2.products[0] as any).name = "Mutated name";');
content = content.replace(/snap\.barcodes\[0\]\.barcode = "000555";/g, '(snap.barcodes[0] as any).barcode = "000555";');
content = content.replace(/snap\.product_units\[0\]\.conversion_factor = "1.5000";/g, '(snap.product_units[0] as any).conversion_factor = "1.5000";');

// Fix TS2345: Argument of type '{ products: ... }' is not assignable to type 'PosCatalogBootstrapSnapshot'
content = content.replace(/\{ \.\.\.snap\.products\[0\] \} \/\/ same ID/g, '{ ...snap.products[0] as any }');

fs.writeFileSync(testFile, content);
console.log('Fixed TS errors in tests');
