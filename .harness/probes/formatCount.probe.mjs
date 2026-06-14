import { formatCount } from '../../app/formatCount.js';
const cases = [
  [0,'0'],[7,'7'],[42,'42'],[999,'999'],
  [1000,'1K'],[1234,'1.2K'],[1999,'1.9K'],[9999,'9.9K'],[12000,'12K'],[100500,'100.5K'],
  [999499,'999.4K'],[999999,'999.9K'],
  [1000000,'1M'],[1234567,'1.2M'],[3400000,'3.4M'],[999900000,'999.9M'],
  [1000000000,'1B'],[2500000000,'2.5B'],
  [-1500,'-1.5K'],
  [null,'0'],[undefined,'0'],[NaN,'0'],['1234','1.2K'],
];
let pass=0,fail=0;
for(const [inp,exp] of cases){
  const got=formatCount(inp);
  const ok=got===exp;
  if(ok)pass++;else fail++;
  console.log(`${ok?'✓':'✗'} formatCount(${JSON.stringify(inp)}) = ${JSON.stringify(got)} ${ok?'':'(expected '+JSON.stringify(exp)+')'}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
