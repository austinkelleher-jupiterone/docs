import {
  deleteAllThingsCurrentlyOnVanillaForum,
  updateVanillaWithDirectoryToWatch,
} from "./";
import { logger } from "./loggingUtil";

const updateCommunityDocsByMergeChanges = async () => {
  try {
    await deleteAllThingsCurrentlyOnVanillaForum();
    const completed = await updateVanillaWithDirectoryToWatch();

    logger.info(
      `UpdateCommunityDocs completed: ${JSON.stringify(completed, null, 2)}`
    );
  } catch (error) {
    logger.error(`UpdateCommunityDocs Errored: \n ${JSON.stringify(error)}`);
  }
};
export default updateCommunityDocsByMergeChanges();
