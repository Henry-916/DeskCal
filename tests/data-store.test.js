const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { saveStore, loadStore } = require('../src/data-store');
const { DEFAULT_DATA } = require('../src/data-model');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deskcal-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('F01 写入后主文件内容等于传入数据，目录里不残留 .tmp', () => {
  withTempDir((dir) => {
    const dataPath = path.join(dir, 'deskcal-data.json');
    const data = { schemaVersion: 2, events: [], settings: { theme: 'light' } };
    saveStore(dataPath, data);

    assert.ok(fs.existsSync(dataPath));
    const saved = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.deepEqual(saved, data);
    assert.equal(fs.existsSync(`${dataPath}.tmp`), false);
  });
});

test('F01 .bak 的修改时间在间隔之内时，连续两次写入不改变 .bak 的内容', () => {
  withTempDir((dir) => {
    const dataPath = path.join(dir, 'deskcal-data.json');
    const data1 = { schemaVersion: 2, v: 1 };
    const data2 = { schemaVersion: 2, v: 2 };
    const data3 = { schemaVersion: 2, v: 3 };

    const t0 = new Date('2026-10-11T10:00:00Z');
    saveStore(dataPath, data1, { now: t0 });

    const t1 = new Date('2026-10-11T10:01:00Z');
    saveStore(dataPath, data2, { now: t1 });
    assert.ok(fs.existsSync(`${dataPath}.bak`));
    const bakContent1 = fs.readFileSync(`${dataPath}.bak`, 'utf8');
    assert.deepEqual(JSON.parse(bakContent1), data1);

    const t2 = new Date('2026-10-11T10:05:00Z'); // 4 mins later, < 10 mins
    saveStore(dataPath, data3, { now: t2 });
    const bakContent2 = fs.readFileSync(`${dataPath}.bak`, 'utf8');
    assert.equal(bakContent2, bakContent1, '.bak 内容不应改变');
  });
});

test('F01 .bak 的修改时间早于间隔时，写入前的主文件内容进入 .bak', () => {
  withTempDir((dir) => {
    const dataPath = path.join(dir, 'deskcal-data.json');
    const data1 = { schemaVersion: 2, v: 1 };
    const data2 = { schemaVersion: 2, v: 2 };
    const data3 = { schemaVersion: 2, v: 3 };

    saveStore(dataPath, data1);
    saveStore(dataPath, data2);

    const bakPath = `${dataPath}.bak`;
    const pastSeconds = Math.floor(Date.now() / 1000) - 1200; // 20 mins ago
    fs.utimesSync(bakPath, pastSeconds, pastSeconds);

    saveStore(dataPath, data3);
    const bakContent = JSON.parse(fs.readFileSync(bakPath, 'utf8'));
    assert.deepEqual(bakContent, data2, '写入前主文件内容 data2 应进入 .bak');
  });
});

test('F01 传入无法序列化的数据时抛错，主文件和 .bak 都保持不变', () => {
  withTempDir((dir) => {
    const dataPath = path.join(dir, 'deskcal-data.json');
    const data1 = { schemaVersion: 2, v: 1 };
    const data2 = { schemaVersion: 2, v: 2 };

    saveStore(dataPath, data1);
    saveStore(dataPath, data2);

    const mainBefore = fs.readFileSync(dataPath, 'utf8');
    const bakBefore = fs.readFileSync(`${dataPath}.bak`, 'utf8');

    const circular = {};
    circular.self = circular;

    assert.throws(() => {
      saveStore(dataPath, circular);
    });

    const mainAfter = fs.readFileSync(dataPath, 'utf8');
    const bakAfter = fs.readFileSync(`${dataPath}.bak`, 'utf8');
    assert.equal(mainAfter, mainBefore);
    assert.equal(bakAfter, bakBefore);
    assert.equal(fs.existsSync(`${dataPath}.tmp`), false);
  });
});

test('F02 情况1：主文件可解析且顶层是对象，source 为 main', () => {
  withTempDir((dir) => {
    const dataPath = path.join(dir, 'deskcal-data.json');
    const diskData = { schemaVersion: 1, events: [{ id: 'e1', title: '旧日程', date: '2026-10-12' }] };
    fs.writeFileSync(dataPath, JSON.stringify(diskData), 'utf8');

    const result = loadStore(dataPath);
    assert.equal(result.source, 'main');
    assert.equal(result.corruptPath, null);
    assert.equal(result.data.schemaVersion, 2);
    assert.equal(result.data.events.length, 1);
    // 迁移后内容与磁盘不一致应写回
    const onDisk = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.equal(onDisk.schemaVersion, 2);
  });
});

test('F02 情况2：主文件不存在，.bak 可用，source 为 backup 并写回主文件', () => {
  withTempDir((dir) => {
    const dataPath = path.join(dir, 'deskcal-data.json');
    const bakData = { schemaVersion: 2, events: [{ id: 'b1', title: '备份日程', date: '2026-10-12' }] };
    fs.writeFileSync(`${dataPath}.bak`, JSON.stringify(bakData), 'utf8');

    const result = loadStore(dataPath);
    assert.equal(result.source, 'backup');
    assert.equal(result.corruptPath, null);
    assert.equal(result.data.events.length, 1);
    assert.equal(result.data.events[0].id, 'b1');
    assert.ok(fs.existsSync(dataPath));
    const mainSaved = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.equal(mainSaved.events[0].id, 'b1');
  });
});

test('F02 情况3：主文件不存在，.bak 不存在或不可用，source 为 default 并写入默认数据', () => {
  withTempDir((dir) => {
    const dataPath = path.join(dir, 'deskcal-data.json');
    const result = loadStore(dataPath);
    assert.equal(result.source, 'default');
    assert.equal(result.corruptPath, null);
    assert.deepEqual(result.data.events, DEFAULT_DATA.events);
    assert.ok(fs.existsSync(dataPath));
  });

  withTempDir((dir) => {
    const dataPath = path.join(dir, 'deskcal-data.json');
    fs.writeFileSync(`${dataPath}.bak`, 'invalid json', 'utf8');
    const result = loadStore(dataPath);
    assert.equal(result.source, 'default');
    assert.equal(result.corruptPath, null);
    assert.deepEqual(result.data.events, DEFAULT_DATA.events);
    assert.ok(fs.existsSync(dataPath));
  });
});

test('F02 情况4：主文件损坏，.bak 可用，留存损坏文件，.bak 逐字节不变，用备份恢复', () => {
  withTempDir((dir) => {
    const dataPath = path.join(dir, 'deskcal-data.json');
    const corruptContent = '{"corrupted json: unfinished';
    fs.writeFileSync(dataPath, corruptContent, 'utf8');

    const bakData = { schemaVersion: 2, events: [{ id: 'bk1', title: '备份', date: '2026-10-12' }] };
    const bakRaw = JSON.stringify(bakData, null, 2);
    fs.writeFileSync(`${dataPath}.bak`, bakRaw, 'utf8');
    const bakBytesBefore = fs.readFileSync(`${dataPath}.bak`);

    const result = loadStore(dataPath);
    assert.equal(result.source, 'backup');
    assert.ok(result.corruptPath);
    assert.ok(fs.existsSync(result.corruptPath));
    assert.equal(fs.readFileSync(result.corruptPath, 'utf8'), corruptContent);

    const bakBytesAfter = fs.readFileSync(`${dataPath}.bak`);
    assert.deepEqual(bakBytesAfter, bakBytesBefore, '.bak 的内容在恢复前后逐字节不变');

    const mainOnDisk = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.equal(mainOnDisk.events[0].id, 'bk1');
  });
});

test('F02 情况5：主文件损坏，.bak 不存在或不可用，留存损坏文件并写入默认数据', () => {
  withTempDir((dir) => {
    const dataPath = path.join(dir, 'deskcal-data.json');
    const corruptContent = 'bad syntax';
    fs.writeFileSync(dataPath, corruptContent, 'utf8');

    const result = loadStore(dataPath);
    assert.equal(result.source, 'default');
    assert.ok(result.corruptPath);
    assert.ok(fs.existsSync(result.corruptPath));
    assert.equal(fs.readFileSync(result.corruptPath, 'utf8'), corruptContent);

    assert.ok(fs.existsSync(dataPath));
    const mainOnDisk = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.deepEqual(mainOnDisk.events, DEFAULT_DATA.events);
  });
});

test('F02 主文件内容为 null 或 [] 时按损坏处理', () => {
  withTempDir((dir) => {
    const dataPath = path.join(dir, 'deskcal-data.json');
    fs.writeFileSync(dataPath, 'null', 'utf8');
    const resultNull = loadStore(dataPath);
    assert.equal(resultNull.source, 'default');
    assert.ok(resultNull.corruptPath);
    assert.equal(fs.readFileSync(resultNull.corruptPath, 'utf8'), 'null');
  });

  withTempDir((dir) => {
    const dataPath = path.join(dir, 'deskcal-data.json');
    fs.writeFileSync(dataPath, '[]', 'utf8');
    const resultArr = loadStore(dataPath);
    assert.equal(resultArr.source, 'default');
    assert.ok(resultArr.corruptPath);
    assert.equal(fs.readFileSync(resultArr.corruptPath, 'utf8'), '[]');
  });
});

test('F02 留存损坏文件失败时抛错且不覆盖原损坏文件', () => {
  withTempDir((dir) => {
    const dataPath = path.join(dir, 'deskcal-data.json');
    const corruptContent = '{ corrupt json';
    fs.writeFileSync(dataPath, corruptContent, 'utf8');

    const fixedTime = new Date('2026-10-11T12:00:00Z');
    const corruptDest = `${dataPath}.corrupt-${fixedTime.getTime()}`;
    fs.mkdirSync(corruptDest);

    assert.throws(() => {
      loadStore(dataPath, { now: fixedTime });
    });

    assert.equal(fs.readFileSync(dataPath, 'utf8'), corruptContent);
  });
});

test('R1 备份刷新时间以复制时刻为准，Windows复制后连续写入不冲掉备份', () => {
  withTempDir((dir) => {
    const dataPath = path.join(dir, 'deskcal-data.json');
    const bakPath = `${dataPath}.bak`;
    const dataA = { schemaVersion: 2, name: 'A' };
    const dataZ = { schemaVersion: 2, name: 'Z' };
    const dataB = { schemaVersion: 2, name: 'B' };
    const dataC = { schemaVersion: 2, name: 'C' };

    fs.writeFileSync(dataPath, JSON.stringify(dataA, null, 2), 'utf8');
    fs.writeFileSync(bakPath, JSON.stringify(dataZ, null, 2), 'utf8');

    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    fs.utimesSync(dataPath, oneHourAgo, oneHourAgo);
    fs.utimesSync(bakPath, oneHourAgo, oneHourAgo);

    // 不传 now，连续调用两次 saveStore，分别写入 B 和 C
    saveStore(dataPath, dataB);
    const bakAfterFirst = JSON.parse(fs.readFileSync(bakPath, 'utf8'));
    assert.deepEqual(bakAfterFirst, dataA, '第一次之后 .bak 的内容应是 A');

    saveStore(dataPath, dataC);
    const bakAfterSecond = JSON.parse(fs.readFileSync(bakPath, 'utf8'));
    const mainAfterSecond = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.deepEqual(bakAfterSecond, dataA, '第二次之后 .bak 的内容仍是 A');
    assert.deepEqual(mainAfterSecond, dataC, '主文件应是 C');
  });
});
