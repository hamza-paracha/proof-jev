import assert from "node:assert/strict";
import { it } from "node:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ModelBudget } from "../src/verify/routing.ts";
import { pluginStatus } from "../src/verify/setup.ts";
import { changeFixture } from "./helpers/change-fixture.ts";

it("plugin setup distinguishes local analysis, execution permission and optional review", async () => {
  const fixture = await changeFixture();
  try {
    const status = await pluginStatus({projectRoot:fixture.root});
    assert.equal(status.capabilities.analysis.ready,true);
    assert.equal(status.capabilities.mutation.ready,false);
    assert.equal(status.capabilities.review.ready,false);
    assert.equal((await pluginStatus({projectRoot:fixture.root,allowExecution:true})).capabilities.mutation.ready,true);
    await writeFile(join(fixture.root,'vouch.config.json'),'{"testCommand":"npm test"}');
    const invalid = await pluginStatus({projectRoot:fixture.root,allowExecution:true});
    assert.equal(invalid.project.config,'invalid');
    assert.equal(invalid.capabilities.mutation.ready,false);
    assert.equal(invalid.capabilities.analysis.ready,true);
    const review = {projectRoot:fixture.root,adapter:{model:"fake",judge:async()=>{throw new Error("Setup must not call a provider");}},budget:new ModelBudget(10,0.01,0.01)};
    assert.equal((await pluginStatus({projectRoot:fixture.root,review})).capabilities.review.ready,true);
    review.budget.reserve();
    assert.equal((await pluginStatus({projectRoot:fixture.root,review})).capabilities.review.ready,false);
    const missing = await pluginStatus();
    assert.equal(missing.project.path,null);
    assert.equal(missing.capabilities.analysis.ready,false);
  } finally {await fixture.close();}
});
