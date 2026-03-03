// import { EmptyProject } from '@/components/dashboard/EmptyProject';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';

export const Dashboard = () => {
  return (
    <ResizablePanelGroup orientation="horizontal">
      {/* Graphs and Tables Area */}
      <ResizablePanel
        defaultSize="20%"
        className="flex justify-center items-center"
      >
        Graphs and Tables Area
      </ResizablePanel>
      <ResizableHandle withHandle />

      {/* Video Viewport */}
      <ResizablePanel
        defaultSize="80%"
        className="flex justify-center items-center"
      ></ResizablePanel>
    </ResizablePanelGroup>
  );
};
