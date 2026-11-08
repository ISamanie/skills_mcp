Skill
The first issue I had was that the skill was not called on every iteration/question. For example when I started a discussion on the life cycle of a frog it would include the initial prompt but would not include the follow up questions I asked it or other related ideas I asked about, meaning that the summary document I requested at the end of the conversation was incomplete. 

I figured that my when to use it was too narrow causing it to ignore the skill on subsequent prompts. To fix this I broadened the situations under which the ai is to use the skill and it seems to have fixed the issue. 

MCP
Something I had to work on was how the AI was updating existing summary files,  instead of editing the existing summary file the AI would create an additional file and then on the next access only provide one of those files. To fix this I had to update my mcp code to allow the ai to update/considilate existing files. After this fix the server was able to return a result that considered more than just one conversation.
