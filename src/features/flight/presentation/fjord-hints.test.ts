import test from 'node:test';
import assert from 'node:assert/strict';
import { RING_HIGH, fjordHint } from './fjord-hints.ts';
import { HINT_HOLD, HINT_WIDTH, holdHint } from './hints.ts';
const hint = (fields: Partial<Parameters<typeof fjordHint>[0]>) => fjordHint({ airtime: 30, ...fields });

test('navigation prioritizes automatic travel, the arch and the boundary',()=>{
 assert.equal(hint({auto:'projects',arch:true,outside:true}),'flying itself to projects · drag to take over');
 assert.match(hint({nearArch:true}),/^through the arch/);
 assert.match(hint({arch:true}),/^Good Lift/);
 assert.match(hint({outside:true}),/^the fog turns you back/);
});
test('ring guidance preserves access with the same reachable descent instruction for mouse and touch',()=>{
 assert.equal(hint({nearRing:true,unvisited:true,agl:RING_HIGH+1}),'circle down toward the ring');
 assert.equal(hint({nearRing:true,unvisited:true,agl:60,touch:true}),'circle down toward the ring');
 for(const fields of [{agl:RING_HIGH,unvisited:true},{agl:60,unvisited:false}])assert.equal(hint({nearRing:true,...fields}),'');
});
test('the first flight explains website navigation, then becomes quiet',()=>{
 assert.match(hint({airtime:3}),/^lit pillars/);assert.match(hint({airtime:12,touch:true}),/^tap a pillar/);
 assert.equal(hint({airtime:20}),'');
 for(const fields of [{nearArch:true},{arch:true},{outside:true},{nearRing:true,unvisited:true,agl:60}])assert.ok([...hint(fields)].length<=HINT_WIDTH);
});
test('navigation lines are held on the frame clock, with immediate boundary guidance',()=>{
 const held={line:'',since:0},ring=hint({nearRing:true,unvisited:true,agl:60});
 assert.equal(holdHint(held,ring,30),ring);assert.equal(holdHint(held,'',30.5),ring);
 const boundary=hint({outside:true});assert.equal(holdHint(held,boundary,30.6),boundary);
 assert.equal(holdHint(held,'',30.6+HINT_HOLD),'');
});
