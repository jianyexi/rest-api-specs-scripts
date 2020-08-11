// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See License in the project root for license information.

import { devOps, cli } from '@azure/avocado'
import * as utils from './utils'
import * as oav from 'oav'
import * as format from "@azure/swagger-validation-common";
import * as fs from "fs-extra";

function getDocUrl(id: string | undefined) {
  return `https://github.com/Azure/azure-rest-api-specs/blob/master/documentation/Semantic-and-Model-Violations-Reference.md#${id}`;
}

export async function main() {
  const pr = await devOps.createPullRequestProperties(cli.defaultConfig());
  const swaggersToProcess = await utils.getFilesChangedInPR(pr);

  let exitCode: number = 0;
  for (const swagger of swaggersToProcess) {
    try {
      const options = {consoleLogLevel: 'error', pretty: true};
      const validator = new oav.ModelValidator(swagger, null, options);
      await validator.initialize();
      console.log(`Validating "examples" and "x-ms-examples" in  ${swagger}:\n`);
      await validator.validateOperations();
      const validatorSpecValidationResult = validator.specValidationResult;
      const errors = oav.getErrorsFromModelValidation(validatorSpecValidationResult);
      const pipelineResultDatas: format.ResultMessageRecord[] = errors.map(function(it) {
        let pipelineResultData: format.ResultMessageRecord = {
          type: "Result",
          level: "Error" as format.MessageLevel,
          message: it.details!.message || "",
          code: it.code || "",
          docUrl: getDocUrl(it.code),
          time: new Date(),
          extra: {
            operationId: it.operationId,
            scenario: it.scenario,
            source: it.source,
            responseCode: it.responseCode,
            severity: it.severity
          },
          paths: []
        }
        if (it.details!.url && it.details!.position) pipelineResultData.paths.push(
          {
            tag: "Url",
            path: utils.blobHref(
              utils.getGithubStyleFilePath(
                utils.getRelativeSwaggerPathToRepo(it.details!.url + '#L' + String(it.details!.position.line) || "")
              )
            )
          }
        );
        if (it.details!.jsonUrl && it.details!.jsonPosition) pipelineResultData.paths.push(
          {
            tag: "JsonUrl",
            path: utils.blobHref(
              utils.getGithubStyleFilePath(
                utils.getRelativeSwaggerPathToRepo(it.details!.jsonUrl + '#L' + String(it.details!.jsonPosition.line) || "")
              )
            )
          }
        );
        return pipelineResultData;
      });
      if (pipelineResultDatas.length > 0) exitCode = 1;
      fs.appendFileSync("pipe.log", JSON.stringify(pipelineResultDatas) + "\n");
      console.log(`model validation error log: ${JSON.stringify(pipelineResultDatas)}`);
    } catch (e) {
      console.error("error: ")
      console.error(e)
      exitCode = 1
    }
  }
  process.exitCode = exitCode;
}
