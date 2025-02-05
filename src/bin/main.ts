import 'source-map-support/register';
import Engine from "../lib/engine/engine";
import Slack from "../lib/io/slack";
import log from '../lib/log/logger';
import { Database } from "../lib/model/database";
import { cli } from "../lib/parameters/cli-args";
import { ioFromCliArgs } from '../lib/parameters/cli-io';
import { envConfig, runLoopConfigFromENV, slackConfigFromENV } from "../lib/parameters/env-config";
import { AttachableError, KnownError } from "../lib/util/errors";
import run from "../lib/util/runner";

main();
async function main() {

  log.setLevelFrom(cli.get('--loglevel'));

  const io = ioFromCliArgs();
  cli.failIfExtraOpts();

  let slack: Slack | undefined;
  const slackConfig = slackConfigFromENV();
  if (slackConfig.apiToken) {
    const { apiToken, errorChannelId } = slackConfig;
    slack = new Slack(apiToken, errorChannelId);
  }

  await slack?.postToSlack(`Starting Marketing Engine`);

  const loopConfig = runLoopConfigFromENV();

  await run(loopConfig, {

    async work() {
      const db = new Database(io, envConfig);
      await new Engine().run(db, null);
    },

    async failed(errors) {
      await slack?.postToSlack(`Failed ${loopConfig.retryTimes} times. Below are the specific errors, in order. Trying again in ${loopConfig.runInterval}.`);
      for (const error of errors) {
        if (error instanceof KnownError) {
          await slack?.postErrorToSlack(error.message);
        }
        else if (error instanceof AttachableError) {
          await slack?.postErrorToSlack(`\`\`\`\n${error.stack}\n\`\`\``);
          await slack?.postAttachmentToSlack({
            title: 'Error attachment for ^',
            content: error.attachment,
          });
        }
        else {
          await slack?.postErrorToSlack(`\`\`\`\n${error.stack}\n\`\`\``);
        }
      }
    },

  });

}
