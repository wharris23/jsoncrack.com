import React from "react";
import type { ModalProps } from "@mantine/core";
import {
  Modal,
  Stack,
  Text,
  ScrollArea,
  Flex,
  CloseButton,
  Button,
  Textarea,
} from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";
import useFile from "../../../store/useFile";
import { modify as jsoncModify } from "jsonc-parser";

// return object from json removing array and object fields
const normalizeNodeData = (nodeRows: NodeData["text"]) => {
  if (!nodeRows || nodeRows.length === 0) return "{}";
  if (nodeRows.length === 1 && !nodeRows[0].key) return `${nodeRows[0].value}`;

  const obj = {};
  nodeRows?.forEach(row => {
    if (row.type !== "array" && row.type !== "object") {
      if (row.key) obj[row.key] = row.value;
    }
  });
  return JSON.stringify(obj, null, 2);
};

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeModal = ({ opened, onClose }: ModalProps) => {
  const nodeData = useGraph(state => state.selectedNode);
  const setJsonContents = useFile(state => state.setContents);
  const contents = useFile(state => state.contents);

  const [isEditing, setIsEditing] = React.useState(false);
  const [editedValue, setEditedValue] = React.useState<string>("");

  React.useEffect(() => {
    setIsEditing(false);
    setEditedValue(normalizeNodeData(nodeData?.text ?? []));
  }, [nodeData]);

  const applyEditToJson = (originalJson: string, path?: NodeData["path"], newValueRaw?: string) => {
    try {
      if (!path || path.length === 0) {
        // root replacement
        const parsed = JSON.parse(originalJson);
        let newVal: any;
        try {
          newVal = JSON.parse(newValueRaw ?? "null");
        } catch (e) {
          // not valid JSON -> treat as string
          newVal = String(newValueRaw ?? "");
        }
        return JSON.stringify(newVal, null, 2);
      }

      // parse the full json tree to get offset info
      // Build a jsonc-parser edit using the path
      const nodePath = path.map(p => (typeof p === "number" ? p : String(p)));

      // prepare new value
      let newVal: any;
      try {
        newVal = JSON.parse(newValueRaw ?? "null");
      } catch (e) {
        newVal = String(newValueRaw ?? "");
      }

      const edits = jsoncModify(originalJson, nodePath as any, newVal, {
        formattingOptions: { insertSpaces: true, tabSize: 2 },
      });

      // apply edits
      let result = originalJson;
      // edits come in order; apply from end to start to preserve offsets
      edits
        .slice()
        .reverse()
        .forEach(e => {
          result = result.slice(0, e.offset) + e.content + result.slice(e.offset + e.length);
        });

      return result;
    } catch (err) {
      // fallback: attempt naive replace
      return originalJson;
    }
  };

  const handleSave = () => {
    if (!nodeData) return;

    try {
      const updated = applyEditToJson(contents, nodeData.path, editedValue);
      // update editor contents which will flow to useJson and graph via existing debounced logic
      setJsonContents({ contents: updated, hasChanges: true });
      setIsEditing(false);
      onClose?.();
    } catch (err) {
      // ignore for now
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditedValue(normalizeNodeData(nodeData?.text ?? []));
  };

  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Flex gap="xs" align="center">
              {!isEditing && (
                <Button size="xs" variant="default" onClick={() => setIsEditing(true)}>
                  Edit
                </Button>
              )}
              {isEditing && (
                <>
                  <Button size="xs" color="green" onClick={handleSave}>
                    Save
                  </Button>
                  <Button size="xs" variant="subtle" onClick={handleCancel}>
                    Cancel
                  </Button>
                </>
              )}
              <CloseButton onClick={onClose} />
            </Flex>
          </Flex>

          <ScrollArea.Autosize mah={250} maw={600}>
            {!isEditing ? (
              <CodeHighlight
                code={normalizeNodeData(nodeData?.text ?? [])}
                miw={350}
                maw={600}
                language="json"
                withCopyButton
              />
            ) : (
              <Textarea
                value={editedValue}
                onChange={e => setEditedValue(e.currentTarget.value)}
                minRows={4}
                maxRows={20}
              />
            )}
          </ScrollArea.Autosize>
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(nodeData?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
