import HttpClient from "../httpClient";
import { replaceArticleBodyWithIntegration } from "../integrationHandling";
import { logger } from "../loggingUtil";
import { updateArticleInternalMarkdownLinks } from "../updateArticleInternalMarkdownLinks";
import {
  FLAG_FOR_DELETE,
  isArticleType,
  isKnowledgeCategoryType,
  VanillaArticle,
  VanillaKnowledgeCategory,
} from "../utils";
import {
  createKnowledgeCategory,
  deleteEmptyCategories,
  getAllArticles,
  getKnowedgeCategories,
  makeRequestsToChangeMarkdownReferences,
} from "../VanillaAPI";
import {
  addVanillaArticlesToProcedures,
  addVanillaCategoryToProcedure,
} from "./addMeta";
import {
  procedureToArticle,
  procedureToKnowledgeCategory,
  removeDeletedCategories,
} from "./conversion";
import { createChangesContentForStaging } from "./stagingUpdateArticle";
import { getPreviousKnowledgeID, hasKnowledgeCategoryBeenMoved } from "./utils";

export interface HandleKnowledgeCategoryChangedParentCreateProps {
  procedure: VanillaKnowledgeCategory;
  newName: string;
  previousknowledgeCategoryID: number | null;
  httpClient: HttpClient;
  existingknowledgeCategoryInfo: VanillaKnowledgeCategory[];
}

export const handleKnowledgeCategoryChangedParentCreate = async ({
  procedure,
  newName,
  previousknowledgeCategoryID,
  httpClient,
  existingknowledgeCategoryInfo,
}: HandleKnowledgeCategoryChangedParentCreateProps) => {
  let isReleaseNotes = false;
  const tempExistingKnowledgeCategoryInfo = existingknowledgeCategoryInfo;
  const procedureWorkedOn = { ...procedure };
  if (
    procedureWorkedOn.path &&
    procedureWorkedOn.path.toLowerCase().indexOf("release-notes") !== -1
  ) {
    isReleaseNotes = true;
  }

  const newReqData = {
    name: newName,
    parentID: previousknowledgeCategoryID,
    knowledgeBaseID: isReleaseNotes ? 2 : 1,
  };
  try {
    const createdKnowledgeCategory = await createKnowledgeCategory(
      httpClient,
      newReqData
    );

    if (createdKnowledgeCategory) {
      tempExistingKnowledgeCategoryInfo.push({
        ...createdKnowledgeCategory,
        childCategoryCount: createdKnowledgeCategory.childCategoryCount
          ? createdKnowledgeCategory.childCategoryCount
          : 1,
      });

      return {
        existingknowledgeCategoryInfo: tempExistingKnowledgeCategoryInfo,
        updatedPreviousKnowledgeCategoryID:
          createdKnowledgeCategory.knowledgeCategoryID,
      };
    }
  } catch (e) {
    logger.error(`CREATE ERROR Already exists- \n ${e}`);
  }
};

export const useProceduresForVanillaRequests = async (
  procedures: (VanillaArticle | VanillaKnowledgeCategory)[],
  httpHandling: HttpClient,
  existingknowledgeCategoryInfo: VanillaKnowledgeCategory[],
  completedProcedures?: (VanillaArticle | VanillaKnowledgeCategory)[]
): Promise<(VanillaArticle | VanillaKnowledgeCategory)[]> => {
  const httpClient = httpHandling;
  const tempCompletedProcedures = completedProcedures
    ? [...completedProcedures]
    : [];
  const tempProcedures = [...procedures];
  let tempExistingKnowledgeCategoryInfo = [...existingknowledgeCategoryInfo];
  let previousknowledgeCategoryID = null;

  // this needs to be syncronous, going in order of the procedures.
  // for example - a new folder with a markdown file, we need to make a
  // new knowledgeCategory and use its id to create the new article
  let procedureWorkedOn = tempProcedures.shift();

  if (!procedureWorkedOn) {
    return tempCompletedProcedures;
  }

  previousknowledgeCategoryID = getPreviousKnowledgeID(
    tempCompletedProcedures,
    procedureWorkedOn,
    existingknowledgeCategoryInfo
  );

  if (isKnowledgeCategoryType(procedureWorkedOn)) {
    const hasChangedParent = hasKnowledgeCategoryBeenMoved({
      proceduresWithVanillaInfo: existingknowledgeCategoryInfo,
      procedure: procedureWorkedOn,
    });

    if (typeof hasChangedParent === "string") {
      const parentCreation = await handleKnowledgeCategoryChangedParentCreate({
        procedure: procedureWorkedOn,
        newName: hasChangedParent,
        previousknowledgeCategoryID,
        httpClient,
        existingknowledgeCategoryInfo,
      });
      if (parentCreation) {
        tempExistingKnowledgeCategoryInfo =
          parentCreation.existingknowledgeCategoryInfo;
        previousknowledgeCategoryID =
          parentCreation.updatedPreviousKnowledgeCategoryID ||
          previousknowledgeCategoryID;
      }
    }

    if (typeof hasChangedParent === "number") {
      procedureWorkedOn = await procedureToKnowledgeCategory(
        httpClient,
        procedureWorkedOn,
        hasChangedParent
      );
      tempExistingKnowledgeCategoryInfo.push(procedureWorkedOn);
    } else {
      procedureWorkedOn = await procedureToKnowledgeCategory(
        httpClient,
        procedureWorkedOn,
        previousknowledgeCategoryID
      );
      tempExistingKnowledgeCategoryInfo.push(procedureWorkedOn);
    }
  }
  if (isArticleType(procedureWorkedOn)) {
    procedureWorkedOn = await procedureToArticle(
      httpClient,
      procedureWorkedOn,
      previousknowledgeCategoryID
    );
  }

  tempCompletedProcedures.push(procedureWorkedOn);

  return await useProceduresForVanillaRequests(
    tempProcedures,
    httpHandling,
    tempExistingKnowledgeCategoryInfo,
    tempCompletedProcedures
  );
};

export interface ProceduresToVanillaRequestProps {
  procedures: (VanillaArticle | VanillaKnowledgeCategory)[];
  integrationsOnly?: boolean;
}

export const proceduresToVanillaRequests = async ({
  procedures,
  integrationsOnly,
}: ProceduresToVanillaRequestProps): Promise<
  (VanillaArticle | VanillaKnowledgeCategory)[]
> => {
  if (procedures && procedures.length) {
    const httpClient = new HttpClient();

    const existingknowledgeCategoryInfo = await getKnowedgeCategories(
      httpClient
    );
    console.log(
      existingknowledgeCategoryInfo,
      "existingknowledgeCategoryInfoexistingknowledgeCategoryInfo"
    );
    logger.info(`Getting Articles`);
    const articles = await getAllArticles(
      httpClient,
      existingknowledgeCategoryInfo
    );
    console.log(getAllArticles, "sjsjsjsjs");
    logger.info(`Mapping Vanilla responses to procedures`);
    const proceduresWithVanillaCategories = procedures.map((p) => {
      if (isKnowledgeCategoryType(p)) {
        return addVanillaCategoryToProcedure(p, existingknowledgeCategoryInfo);
      }
      return p;
    });
    // add body to article before links and images get added

    const proceduresWithArticleInfo = addVanillaArticlesToProcedures(
      proceduresWithVanillaCategories,
      articles
    );

    let alteredProceduresWithArticleInfo = proceduresWithArticleInfo;

    if (integrationsOnly) {
      const { alteredProcedures } = await replaceArticleBodyWithIntegration({
        procedures: [...proceduresWithArticleInfo],
        httpClient,
      });

      alteredProceduresWithArticleInfo = alteredProcedures;
    }

    const processedProcedures = await useProceduresForVanillaRequests(
      alteredProceduresWithArticleInfo,
      httpClient,
      existingknowledgeCategoryInfo
    );
    logger.info(
      `processedProcedures: ${JSON.stringify(processedProcedures, null, 2)}`
    );

    const combinationOfArticlesAndProcedures = [
      ...processedProcedures,
      ...articles,
    ].filter(isArticleType);

    const articlesNeedingLinkUpdates = await updateArticleInternalMarkdownLinks(
      [...processedProcedures],
      combinationOfArticlesAndProcedures
    );

    const updatesToInternalLinks = await makeRequestsToChangeMarkdownReferences(
      articlesNeedingLinkUpdates,
      httpClient
    );

    await createChangesContentForStaging({
      httpClient,
      procedures: processedProcedures.filter(isArticleType),
      combinationOfArticlesAndProcedures,
    });

    logger.info(
      `UpdatesToInternalLinks processed: ${JSON.stringify(
        updatesToInternalLinks,
        null,
        2
      )}`
    );
    const deletableCategories = processedProcedures
      .filter(isKnowledgeCategoryType)
      .filter((c) => c.description === FLAG_FOR_DELETE);

    const { procedures: finishedProcedures } = await removeDeletedCategories(
      httpClient,
      deletableCategories
    );
    logger.info(
      `PROCEDURES processed: ${JSON.stringify(finishedProcedures, null, 2)}`
    );

    await deleteEmptyCategories(httpClient);
    return finishedProcedures;
  }

  return [];
};
