**Demonstration 1**
This is the second conversation in this topic, I used the second to demonstrate its ability to remember across conversations, and append to existing summary docs. We are consistently using the research skill and at the end use the mcp skill, below is attached the generated summary doc.

**“ I want to learn more about how tadpoles survive in their environment, what type of senses do they use to avoid predators “
**
Response summary : 
	Chemical sensing
	Vision
	Water movement
	Each datapoint came with a hyperlink to relevant studies.
Chat ended with this sentence:
 Two related ideas to explore are how tadpoles learn which predators are dangerous and how their senses change as they transform into frogs. 

**“ how their senses change as they transform into a frog?”
**
Response summary:
 Similar to first response
	Smell
	Eyes and brain develop
	Hearing
how hormones coordinate metamorphosis and whether frogs retain memories learned as tadpoles. 

**“How do frogs retain memories learned as tadpoles with such rapid brain development?”
**
Response Summary:
	Part of the nervous system remains
	Changing sensory organs do not erase information
	Surviving brain regions preserve learned data.
Chat points out study weakpoints
‘Also, “remembering” here means that earlier experience changes later behavior, such as an odor preference. The experiments do not show a frog consciously recalling its tadpole life.’
Two useful next connections are how learning changes connections between neurons and how scientists distinguish a retained memory from an inherited instinct.

**“Create a summary doc of this conversation and add it to my existing mcp database. Return the resulting summary doc”**

Summary is included in the summaries folder, file begins with e5a

**Demonstration 2
**I used a completely unrelated topic to show that the mcp server will create a seperate summary doc.
These prompts are taken from a real conversation I had with gemini.

**teach me about  data flow architectures**
Talk about the general history and development of dataflow architectures and a worked example. Provided additional concepts at the end 
Two useful connections to explore next are:
- Out-of-order execution: conventional CPUs also schedule ready instructions by their dependencies, within a bounded instruction window. Comparison with dataflow
- Spatial architectures: map operations onto an array of processing elements and route values between them. CMU’s spatial dataflow discussion
- 
**what type of computations are done by pure dataflow architectures? I would imagine a general purpose computer would require a lot of compiler overhead to be able to run complex programs**
Discusses compiler cost and additional hardware required for more complex functions such as loops and recussion in these types of processor architectures.
Two useful next connections are SSA form, which shows how compilers represent value dependencies, and hybrid dataflow, which groups operations so that every tiny instruction does not require separate token coordination.


**to conceptualize : dataflow nodes often feature input and output buffers which queue inputs until all matching token inputs become available, the node then computes the data using control tokens or it could have a hardcoded physical function, it then places that output on a buffer or sends it to its consumers if possible**
Agrees with my mental model, expands a little bit on tokenization and suggest two other related ideas: operand matching, which ensures correctness, and backpressure, which controls how much unfinished work accumulates.

**“Create a summary doc of this conversation and add it to my existing mcp database. Return the resulting summary doc”**

Summary is included in the summaries folder, file begins with 0fc
