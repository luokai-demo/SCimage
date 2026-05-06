import {
  getScimageRuntime,
} from "./runtime/scimageRuntimeSingleton";
import type { ScimageRuntimePublicApi } from "./runtime/scimageRuntimePublicApi";

export type UseScimageRuntimeReturn = ScimageRuntimePublicApi;

export function useScimageRuntime(): ScimageRuntimePublicApi {
  return getScimageRuntime();
}
