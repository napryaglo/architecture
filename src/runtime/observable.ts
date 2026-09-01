// Observable now lives in @pragmatic-tech-ai/todl-runtime so TODL-generated entity
// classes and mural's MuralBase share one class identity — mural's binding and
// DataTemplate dispatch gate on `instanceof Observable`, so a realized TODL
// node is recognized as a first-class bindable source. Re-exported here so
// every existing `./observable.js` import inside mural is unchanged.
export { Observable } from '@pragmatic-tech-ai/todl-runtime'
