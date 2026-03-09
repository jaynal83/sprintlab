# Development Log

TODO

## Next Steps

3D Direction question:
Path A — Fix the GLB approach properly
We know the 65 Mixamo bones. We know our normalized landmark positions. Instead of using kalidokit, we could compute bone rotations directly from the vector between two landmarks (e.g., the upper arm bone rotation = direction from shoulder to elbow). This is exactly what orientCylinder already does for the cylinders — we'd just be doing the same math in bone-local space. More work but doable.

Path B — Stay procedural, make it look better
Replace cylinders with capsule-shaped geometry (tapered, rounded ends), add a simple skin-toned material, maybe a stylized low-poly human silhouette. No GLB needed, you control everything, and it could look quite good.

Which direction interests you?

- Bring back the distance from CoM to ground contact metric.
- Button to turn off all pose landmarks doesn't work. Remove it. But let's add a new button somewhere when video mode is selected to temporarily hide the pose overlay skeleton. When I toggle that, bring them back on.
- When using the export option, let the draw box disappear after I close the panel.
- Work towards body view looking more like Three.js human model.
- When done, create desktop version (Electron.js?) so that I don't have to upload anything. Find a way to run the application on the desktop and run the Python server on the laptop as well. Will have to figure out how to manage both seamlessly (web sockets)?

## Backend

- Deploy to Fly.io because free tier is more generous and doesn't hibernate? Regardless can write code to warm up the server
-

## Documentation

- Bring ba
- Need to find a way to get the Test Driven Development stuff done.
- Add a help section where we'll write some guides to help users. Will record a demo video and post on YouTube and link here. Will provide a download sample so users can test the platform without having their own sprint video. Can use modals to guide the user on what to do. Allow the user to turn off the modal for subsequent visits and store that in local storage but have the option to turn it back on so that it shows up every time they open the application.
- Use Claude Code to scan all the files and write documentation for every aspect of the codebase (especially the math parts. Let's make the equations be done in LaTEX). Let it explain the design decisions and everything. Then host the docs somewhere and link to it in the README.md. Claude can probably help me set that up.
- Speaking of README.md. Let Claude Code scan the entire codebase and write a really good one (for the entire project and also for the frontend and backend)
- Go to Community Standards (https://github.com/mvch1ne/sprintlab/community) and create these things so that the project is up to standard. Ask Claude Code for the things I can do that will make my project stand out.
- Work on my GitHub profile's README.md to make it better.
