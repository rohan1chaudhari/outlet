import { Button, Modal } from "@heroui/react";

export function Dialog({ title, open, onClose, children, footer }) {
  return (
    <Modal.Backdrop
      isOpen={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="utility-dialog">
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>{children}</Modal.Body>
          <Modal.Footer>
            {footer || (
              <Button variant="secondary" onPress={onClose}>
                Done
              </Button>
            )}
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
