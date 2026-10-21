import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImmutableJson} from '../src/gear/immutable-json.ts';

const bytes=text=>new TextEncoder().encode(text).buffer;

test('verified JSON reuses the same frozen object only for the same buffer',()=>{
  const text='{"item":"traveler_tunic","source":{"hash":"approved"},"faces":[1,3]}';
  const firstBuffer=bytes(text),secondBuffer=bytes(text);
  const first=parseImmutableJson(firstBuffer),second=parseImmutableJson(secondBuffer);
  assert.equal(parseImmutableJson(firstBuffer),first);
  assert.equal(parseImmutableJson(secondBuffer),second);
  assert.notEqual(first,second);
  assert.notEqual(first.source,second.source);
  assert.notEqual(first.faces,second.faces);
  assert.deepEqual(first,JSON.parse(text));
  assert.deepEqual(second,first);
});

test('shared domains, nested arrays and recipe objects cannot be changed by an actor',()=>{
  const buffer=bytes('{"source":{"hash":"approved"},"partial":[{"face":2,"halfplanes":[[1,0,-0.5]]}]}');
  const first=parseImmutableJson(buffer),snapshot=JSON.stringify(first);
  for(const value of [first,first.source,first.partial,first.partial[0],first.partial[0].halfplanes,first.partial[0].halfplanes[0]])assert.ok(Object.isFrozen(value));
  assert.throws(()=>{first.source.hash='changed';},TypeError);
  assert.throws(()=>{first.partial[0].halfplanes[0][2]=0;},TypeError);
  assert.throws(()=>first.partial.push({face:3}),TypeError);
  assert.throws(()=>first.partial.splice(0,1),TypeError);
  assert.throws(()=>{delete first.source;},TypeError);
  assert.throws(()=>{first.extra=true;},TypeError);
  assert.equal(JSON.stringify(parseImmutableJson(buffer)),snapshot);
});

test('invalid JSON rejects repeatedly and cannot leave a cached partial result',()=>{
  const invalid=bytes('[1,]');
  assert.throws(()=>parseImmutableJson(invalid),SyntaxError);
  assert.throws(()=>parseImmutableJson(invalid),SyntaxError);
  // Repair only a failed input to prove the failure was not cached. Production
  // callers must never change verified buffers, including successful inputs.
  new Uint8Array(invalid).set(new TextEncoder().encode('[1 ]'));
  assert.deepEqual(parseImmutableJson(invalid),[1]);
  assert.ok(Object.isFrozen(parseImmutableJson(invalid)));
  for(const text of ['', '{"source":', 'undefined'])assert.throws(()=>parseImmutableJson(bytes(text)),SyntaxError);
});

test('valid JSON primitives and empty structures preserve their exact values',()=>{
  for(const text of ['null','false','0','""','[]','{}']){
    const buffer=bytes(text),value=parseImmutableJson(buffer);
    assert.deepEqual(value,JSON.parse(text));
    assert.equal(parseImmutableJson(buffer),value);
  }
});

test('large face maps freeze without spreading their entries onto the call stack',()=>{
  const buffer=bytes(JSON.stringify(Array.from({length:200_000},(_,i)=>i)));
  const result=parseImmutableJson(buffer);
  assert.equal(result.length,200_000);assert.equal(result.at(-1),199_999);
  assert.ok(Object.isFrozen(result));assert.equal(parseImmutableJson(buffer),result);
});
