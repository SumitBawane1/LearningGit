import React from 'react';
import { VERSION } from '@twilio/flex-ui';
import { FlexPlugin } from '@twilio/flex-plugin';

import CustomTaskListContainer from './components/CustomTaskList/CustomTaskList.Container';
import reducers, { namespace } from './states';

const PLUGIN_NAME = 'SurveyCallPlugin';

export default class SurveyCallPlugin extends FlexPlugin {
  constructor() {
    super(PLUGIN_NAME);
  }

  /**
   * This code is run when your plugin is being started
   * Use this to modify any UI components or attach to the actions framework
   *
   * @param flex { typeof import('@twilio/flex-ui') }
   * @param manager { import('@twilio/flex-ui').Manager }
   */
  async init(flex, manager) {
    this.registerReducers(manager);

    let mgr = flex.Manager.getInstance()
    let full_name = mgr.workerClient.attributes.full_name
    let team_name = mgr.workerClient.attributes.team_name
    
    flex.MessageListItem.Content.remove('content',
    {
      if: (props) => {
        if (props.message.source.state.body != undefined) {
          if (props.message.source.state.body.startsWith("We’d love to hear your feedback on our last interaction. We'd appreciate it if you could fill out this quick survey about your recent experience. Thank you!")) {
            return true
          }
        }
      }
    }
  );


    manager.workerClient.on("reservationCreated", async function (reservation) {      
      if (reservation._worker.attributes.team_name != "PAL_HC") {
        let channelName = reservation.task.taskChannelUniqueName
        if (channelName == 'facebook' || channelName == 'whatsapp' || channelName == "chat") {
          flex.Actions.replaceAction("WrapupTask", async(payload, original) => {
            let channelSid = payload.task.attributes.channelSid
            let skill_name = payload.task.attributes.Skill_Name
            // if (full_name.includes(' ')) {
            //   full_name = full_name.replace(/ /g, '_')
            // }
            let firstName = full_name.split(' ')[0]
            team_name= team_name.substring(0,2)
           
            // to get the agent Name
            if(channelName == 'chat'){
              let newAttributes = payload.task.attributes;
              newAttributes['agentName']  = full_name
              await payload.task.setAttributes(newAttributes);
            }

            if (channelName == 'facebook' || channelName == 'whatsapp') {
              return new Promise(function (resolve, reject) {
                let surveyLink = `We’d love to hear your feedback on our last interaction. We'd appreciate it if you could fill out this quick survey about your recent experience. Thank you! \n https://www.customersurvey.philippineairlines.com/jfe/form/SV_d6eEmOFeHxrY1DM?agentname=${firstName}&teamname=${team_name}&channelsid=${channelSid}&skillname=${skill_name}`
                flex.Actions.invokeAction("SendMessage", {
                  body: surveyLink,
                  channelSid: payload.task.attributes.channelSid
                })
                  .then(response => {
                    // Wait until the message is sent to wrap-up the task:
                    resolve(original(payload));
                  });
              });
            } else {
              original(payload);
            }
          })
        }


        if (channelName === 'voice') {  // Voice Survey for Voice channel Only
          flex.Actions.addListener('beforeHangupCall', async (payload) => { // Once the Agent HangUp, Hang up action framework will invoke
            // getting skill from payload
            let skill = payload.task.attributes.Skill_Name   
            // filter to enable survey
            if (payload.task._outgoingTransferObject != undefined || (payload.task.incomingTransferObject == undefined && payload.task.outgoingTransferObject == undefined ||
              (payload.task._incomingTransferObject.mode == 'COLD'))) {  
              let call_sid;
              call_sid = payload.task.conference.participants[1]._callSid  // customer call_sid in case of transfer and consult call
              for (let i = 0; i < payload.task.conference.participants.length; i++) {
                if (payload.task.conference.participants[i]._source.participant_type == 'customer') {
                  call_sid = payload.task.conference.participants[i]._callSid;
                  console.log(payload.task.conference.participants[i])
                  break;
                }
              }
              let body;
              if (skill) {
                body = {
                  CallSid: call_sid,
                  full_name: full_name,
                  team_name: team_name,
                  skill: skill,
                  attributes: payload.task.attributes,
                  Token: manager.store.getState().flex.session.ssoTokenPayload.token
                }
              } else {
                body = {
                  CallSid: call_sid,
                  full_name: full_name,
                  team_name: team_name,
                  skill: payload.task.queueName,
                  Token: manager.store.getState().flex.session.ssoTokenPayload.token
                }
              }
              let newAttributes = payload.task.attributes;
              let conversations = payload.task.attributes.conversations;
              let newConv = {}
              if (conversations) {
                newConv = { ...conversations };
              }
              newConv.conversation_attribute_10 = call_sid;
              newConv.conversation_id = call_sid;
              newAttributes.conversations = newConv;
              payload.task.setAttributes(newAttributes);
              body['attributes'] = payload.task.attributes;
              const httpOpts = {
                method: 'POST',
                body: new URLSearchParams(body),
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
                }
              }
              await fetch('https://voicesurvey-5968.twil.io/surveyCall', httpOpts); // called Function to continue call.
            }
          });
        }
      }
    });

  }

  /**
   * Registers the plugin reducers
   *
   * @param manager { Flex.Manager }
   */
  registerReducers(manager) {
    if (!manager.store.addReducer) {
      // eslint-disable-next-line
      console.error(`You need FlexUI > 1.9.0 to use built-in redux; you are currently on ${VERSION}`);
      return;
    }

    manager.store.addReducer(namespace, reducers);
  }
}
