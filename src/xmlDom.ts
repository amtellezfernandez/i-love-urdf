export const ensureXmlDom = () => {
  if (typeof globalThis.DOMParser === "undefined" || typeof globalThis.XMLSerializer === "undefined") {
    throw new Error("DOMParser/XMLSerializer not available. Install DOM globals before calling i-love-urdf.");
  }
};

export const parseXml = (xml: string): Document => {
  ensureXmlDom();
  const parser = new DOMParser();
  return parser.parseFromString(xml, "text/xml");
};

export const createEmptyRobotDocument = (): Document => parseXml("<robot></robot>");

export const serializeXml = (document: Document): string => {
  ensureXmlDom();
  const serializer = new XMLSerializer();
  return serializer.serializeToString(document);
};
