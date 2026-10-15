import {validateProjectConfig} from './config.js';
import {redactUrl} from './url.js';

// Projection only: never serialize the private model or selectors wholesale.
export function createExecutionPlan(input){
 const config=validateProjectConfig(input),states=[];
 const routes=config.routes.map(route=>({id:route.id,url:redactUrl(route.url),access:route.access}));
 for(const route of routes)for(const viewport of config.viewports)states.push({id:`route:${route.id}:${viewport}`,routeId:route.id,viewport,access:route.access,status:'planned'});
 const journeys=config.journeys.map(journey=>{
  const route=routes.find(item=>item.id===journey.routeId);
  const steps=journey.steps.map(step=>{
   for(const viewport of config.viewports)states.push({id:`journey:${journey.id}:${step.id}:${viewport}`,routeId:route.id,journeyId:journey.id,stepId:step.id,viewport,access:route.access,status:'planned'});
   return {id:step.id,action:step.action,timeoutMs:step.timeoutMs,...(step.url?{url:redactUrl(step.url)}:{})};
  });
  return {id:journey.id,routeId:journey.routeId,steps};
 });
 return {schemaVersion:1,configSchemaVersion:config.schemaVersion,status:'planned',target:redactUrl(config.baseUrl),requiresRemoteConsent:!['localhost','127.0.0.1','[::1]'].includes(new URL(config.baseUrl).hostname),limits:{...config.limits},options:{concurrency:config.concurrency,waitMs:config.waitMs,screenshots:config.screenshots},viewports:[...config.viewports],routes,journeys,states};
}
