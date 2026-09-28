import assert from "node:assert/strict";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { changeFixture } from "../test/helpers/change-fixture.ts";

const plugin = resolve(process.argv[2] ?? "out/plugin/proof-jev");
const manifest = JSON.parse(await readFile(resolve(plugin,".mcp.json"),"utf8"));
const spec = manifest.mcpServers['proof-jev'];
const fixture = await changeFixture();
try {
  for (const cwd of [fixture.root,plugin]) {
    const client = new Client({name:"plugin-install-check",version:"1"});
    try {
      await client.connect(new StdioClientTransport({command:process.execPath,args:spec.args.map((a:string)=>a.replace('${CLAUDE_PLUGIN_ROOT}',plugin)),cwd,env:{PATH:process.env.PATH??"",HOME:process.env.HOME??""},stderr:"pipe"}));
      assert.equal((await client.listTools()).tools.length,8);
      const status = (await client.callTool({name:"get_setup_status",arguments:{}})).structuredContent as any;
      assert.equal(status.capabilities.analysis.ready,cwd===fixture.root);
      assert.equal(status.capabilities.mutation.ready,false);
      assert.equal(status.capabilities.review.ready,false);
      if(cwd===fixture.root) {
        const analysis = await client.callTool({name:"analyze_change",arguments:{base:"HEAD"}});
        assert.notEqual(analysis.isError,true,JSON.stringify(analysis));
        assert.ok(JSON.stringify(analysis.structuredContent).includes("shipping"));
      } else assert.equal(status.project.path,null);
    } finally {await client.close();}
  }
  console.log(JSON.stringify({manifestLaunch:true,projectDiscovered:true,pluginDirectoryNotSelected:true,tools:8,executionEnabled:false,modelCalls:0}));
} finally {await fixture.close();}
