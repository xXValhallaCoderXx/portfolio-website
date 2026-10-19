import assert from 'node:assert/strict';
import test from 'node:test';
import { EXPERIENCE, PROJECTS } from './content.ts';
import { detailAt, experienceByHash, nextProject, projectById, yearSpan } from './portfolio.service.ts';

test('portfolio lookup and detail addresses share content identities', () => {
  assert.equal(projectById('hird'), PROJECTS[0]);
  assert.equal(experienceByHash(EXPERIENCE[0].hash), EXPERIENCE[0]);
  assert.equal(detailAt('/projects/hird/')?.item, PROJECTS[0]);
  assert.equal(detailAt('/projects/unknown'), null);
  assert.equal(detailAt('/experience/unknown'), null);
  assert.equal(detailAt('/projects/hird/extra'), null);
  assert.equal(nextProject(PROJECTS[PROJECTS.length - 1]), PROJECTS[0]);
});

test('career year labels preserve single years, ranges and current roles', () => {
  assert.equal(yearSpan('Jan 2019 – Dec 2019'), '2019');
  assert.equal(yearSpan('2019 – 2024'), '2019–24');
  assert.equal(yearSpan('Sep 2025 – now'), '2025–now');
});
